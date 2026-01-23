import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus, TeachingLevel } from '@prisma/client';
import { AgentTemplateLoaderService } from './agent-template-loader.service';
import { AIProviderService, AIProviderStreamCallback } from './ai-provider.service';
import { ToolEnabledAIProviderService } from './tool-enabled-ai-provider.service';
import {
  AgentExecutionContext,
  AgentExecutionResult,
  PostProcessingResult,
  PostProcessingError,
} from '../interfaces/agent-template.interface';
import { ExecuteAgentDto } from '../dto/execute-agent.dto';
import { getAgentTemplate } from '../templates';
import { DocumentsService } from '../../documents/documents.service';
import { CodeParserService } from '../../code-generation/code-parser.service';
import { FileSystemService } from '../../code-generation/filesystem.service';
import { BuildExecutorService } from '../../code-generation/build-executor.service';
import { AgentRetryService } from './agent-retry.service';
import { CostTrackingService } from '../../cost-tracking/cost-tracking.service';
import { AgentMemoryService } from '../../agent-memory/agent-memory.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';

/**
 * Teaching level instructions for Phase 5
 * Agents adapt their communication style based on user's technical background
 */
const TEACHING_LEVEL_INSTRUCTIONS: Record<TeachingLevel, string> = {
  NOVICE: `
## Communication Style: NOVICE User
- Use simple, non-technical language
- Explain concepts as if teaching a beginner
- Avoid jargon; when technical terms are necessary, define them
- Use analogies and real-world examples
- Be encouraging and patient
- Break down complex ideas into small steps
- Offer to explain more if something might be confusing`,

  INTERMEDIATE: `
## Communication Style: INTERMEDIATE User
- Balance clarity with technical accuracy
- Use common technical terms without over-explaining basics
- Offer brief explanations for advanced concepts
- Provide options when multiple approaches exist
- Focus on the "why" behind decisions`,

  EXPERT: `
## Communication Style: EXPERT User
- Be concise and direct
- Use precise technical terminology
- Skip basic explanations
- Focus on implementation details and trade-offs
- Assume familiarity with frameworks and patterns
- Highlight edge cases and performance considerations`,
};

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);

  constructor(
    private prisma: PrismaService,
    private templateLoader: AgentTemplateLoaderService,
    private aiProvider: AIProviderService,
    private toolEnabledProvider: ToolEnabledAIProviderService,
    private documentsService: DocumentsService,
    private codeParser: CodeParserService,
    private filesystem: FileSystemService,
    private buildExecutor: BuildExecutorService,
    private retryService: AgentRetryService,
    private costTracking: CostTrackingService,
    private agentMemory: AgentMemoryService,
    private wsGateway: AppWebSocketGateway,
  ) {}

  async executeAgent(executeDto: ExecuteAgentDto, userId: string): Promise<AgentExecutionResult> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: executeDto.projectId },
      include: {
        state: true,
        owner: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only execute agents for your own projects');
    }

    // Check monthly execution limit based on plan tier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, monthlyAgentExecutions: true },
    });

    const limits = {
      FREE: 1000, // Increased for development
      PRO: 5000,
      TEAM: 20000,
      ENTERPRISE: Infinity,
    };

    const executionLimit = limits[user.planTier] || limits.FREE;

    if (user.monthlyAgentExecutions >= executionLimit) {
      throw new BadRequestException(
        `Monthly agent execution limit reached. Your ${user.planTier} plan allows ${executionLimit} executions per month.`,
      );
    }

    // Get agent template
    const template = this.templateLoader.getTemplate(executeDto.agentType);

    if (!template) {
      throw new NotFoundException(`Agent template not found: ${executeDto.agentType}`);
    }

    // Check if agent is compatible with project type
    const projectType = project.type;
    const isCompatible = template.projectTypes.includes(projectType as any);

    if (!isCompatible) {
      throw new BadRequestException(
        `Agent ${executeDto.agentType} is not compatible with project type ${projectType}`,
      );
    }

    // Build execution context, merging any additional context from DTO
    const builtContext = await this.buildExecutionContext(executeDto.projectId, userId);
    const context = {
      ...builtContext,
      ...(executeDto.context || {}), // Merge in any additional context (e.g., userMessage)
    };

    // Create agent execution record and increment user's monthly execution count atomically
    // This ensures billing consistency - either both succeed or neither does
    const agentExecution = await this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          projectId: executeDto.projectId,
          agentType: executeDto.agentType,
          status: 'RUNNING',
          inputPrompt: executeDto.userPrompt,
          model: executeDto.model || template.defaultModel,
          contextData: context as any,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          monthlyAgentExecutions: {
            increment: 1,
          },
        },
      });

      return agent;
    });

    try {
      // Build system prompt from template
      const systemPrompt = this.buildSystemPrompt(template, context);

      // Execute AI prompt
      const aiResponse = await this.aiProvider.executePrompt(
        systemPrompt,
        executeDto.userPrompt,
        executeDto.model || template.defaultModel,
      );

      // Parse AI response to extract actions
      const result = await this.parseAgentOutput(aiResponse.content, executeDto.projectId, userId);

      // Update agent execution record
      await this.prisma.agent.update({
        where: { id: agentExecution.id },
        data: {
          status: result.success ? 'COMPLETED' : 'FAILED',
          outputResult: result.output,
          inputTokens: aiResponse.usage.inputTokens,
          outputTokens: aiResponse.usage.outputTokens,
          completedAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      // Update agent execution with error
      await this.prisma.agent.update({
        where: { id: agentExecution.id },
        data: {
          status: 'FAILED',
          outputResult: error.message,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  async executeAgentStream(
    executeDto: ExecuteAgentDto,
    userId: string,
    streamCallback: AIProviderStreamCallback,
  ): Promise<string> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: executeDto.projectId },
      include: {
        state: true,
        owner: true,
      },
    });

    if (!project) {
      streamCallback.onError(new Error('Project not found'));
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      streamCallback.onError(new Error('Forbidden'));
      throw new ForbiddenException('You can only execute agents for your own projects');
    }

    // Check monthly execution limit and get teaching level
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, monthlyAgentExecutions: true, teachingLevel: true },
    });

    const limits = {
      FREE: 1000, // Increased for development
      PRO: 5000,
      TEAM: 20000,
      ENTERPRISE: Infinity,
    };

    const executionLimit = limits[user.planTier] || limits.FREE;

    if (user.monthlyAgentExecutions >= executionLimit) {
      const error = new BadRequestException(
        `Monthly agent execution limit reached. Your ${user.planTier} plan allows ${executionLimit} executions per month.`,
      );
      streamCallback.onError(error);
      throw error;
    }

    // Phase 5: Get user's teaching level for adapted communication
    const teachingLevel = user.teachingLevel || TeachingLevel.INTERMEDIATE;

    // Get agent template from our new system
    const template = getAgentTemplate(executeDto.agentType);

    if (!template) {
      streamCallback.onError(new Error(`Agent template not found: ${executeDto.agentType}`));
      throw new NotFoundException(`Agent template not found: ${executeDto.agentType}`);
    }

    // Build execution context, merging any additional context from DTO
    const builtContext = await this.buildExecutionContext(executeDto.projectId, userId);
    const context = {
      ...builtContext,
      ...(executeDto.context || {}), // Merge in any additional context (e.g., userMessage)
    };

    // Create agent execution record
    const agentExecution = await this.prisma.agent.create({
      data: {
        projectId: executeDto.projectId,
        agentType: executeDto.agentType,
        status: 'RUNNING',
        inputPrompt: executeDto.userPrompt,
        model: executeDto.model || template.defaultModel,
        contextData: context as any,
      },
    });

    // Store the execution ID for use in callbacks
    const executionId = agentExecution.id;

    // Increment user's monthly execution count
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        monthlyAgentExecutions: {
          increment: 1,
        },
      },
    });

    // Build system prompt from template with teaching level adaptation (Phase 5)
    const systemPrompt = this.buildSystemPromptFromNewTemplate(template, context, teachingLevel);

    // Determine if this agent should use tool-enabled execution
    // Note: PRODUCT_MANAGER and ARCHITECT removed - document generation doesn't need tools
    // and the tool loop was causing issues (incomplete output, hanging)
    // These agents work better with direct generation + post-processing
    const toolEnabledAgents = [
      'FRONTEND_DEVELOPER',
      'BACKEND_DEVELOPER',
      'QA_ENGINEER',
      'SECURITY_ENGINEER',
    ];
    const useToolEnabled = toolEnabledAgents.includes(executeDto.agentType);

    if (useToolEnabled) {
      // Use tool-enabled execution (Phase 1-4, 6)
      this.logger.log(`[${executeDto.agentType}] Using tool-enabled execution`);
      this.toolEnabledProvider
        .executeWithToolsStream(
          systemPrompt,
          executeDto.userPrompt,
          executeDto.projectId,
          executeDto.agentType,
          {
            onChunk: (chunk: string) => {
              streamCallback.onChunk(chunk);
            },
            onComplete: async (response) => {
              await this.handleAgentCompletion(
                executionId,
                executeDto,
                template,
                context,
                systemPrompt,
                response,
                streamCallback,
                userId,
              );
            },
            onError: async (error) => {
              await this.handleAgentError(executionId, error, streamCallback);
            },
          },
          executeDto.model || template.defaultModel,
          template.maxTokens || 8000,
        )
        .catch((error) => this.handleAgentError(executionId, error, streamCallback));

      return executionId;
    }

    // Execute AI prompt with streaming (fire-and-forget, don't await)
    // This allows us to return the execution ID immediately while streaming continues
    this.aiProvider
      .executePromptStream(
        systemPrompt,
        executeDto.userPrompt,
        {
          onChunk: (chunk: string) => {
            // Forward chunk to callback
            streamCallback.onChunk(chunk);
          },
          onComplete: async (response) => {
            // Update agent execution record
            await this.prisma.agent.update({
              where: { id: executionId },
              data: {
                status: 'COMPLETED',
                outputResult: response.content,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                completedAt: new Date(),
              },
            });

            // Track cost and update COST_LOG document (non-critical)
            try {
              const currentGate = context.currentGate || 'G1_PENDING';
              const model = executeDto.model || template.defaultModel;
              const costResult = await this.costTracking.logAgentCost(
                executeDto.projectId,
                executeDto.agentType,
                currentGate,
                model,
                response.usage.inputTokens,
                response.usage.outputTokens,
              );
              this.logger.log(
                `[CostTracking] ${executeDto.agentType} cost: $${costResult.cost.toFixed(4)}, total: $${costResult.totalProjectCost.toFixed(4)}`,
              );
            } catch (error) {
              this.logger.warn('Cost tracking failed (non-critical):', error);
            }

            // Update Agent Log document (non-critical)
            try {
              await this.updateAgentLogDocument(
                executeDto.projectId,
                executeDto.agentType,
                context.currentGate || 'G1_PENDING',
                'Complete',
              );
            } catch (error) {
              this.logger.warn('Agent log update failed (non-critical):', error);
            }

            // Save full agent memory for context recovery (non-critical)
            try {
              await this.agentMemory.saveAgentMemory({
                projectId: executeDto.projectId,
                agentId: executionId,
                agentType: executeDto.agentType,
                gateType: context.currentGate || 'G1_PENDING',
                systemPrompt: systemPrompt,
                userPrompt: executeDto.userPrompt,
                response: response.content,
                documentsUsed: context.availableDocuments || [],
                model: executeDto.model || template.defaultModel,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
              });
              this.logger.log(`[AgentMemory] Saved memory for ${executeDto.agentType}`);
            } catch (error) {
              this.logger.warn('Agent memory save failed (non-critical):', error);
            }

            // Post-processing: Generate documents and handle handoffs (critical - report failures)
            const postProcessResult = await this.postProcessAgentCompletion(
              executionId,
              executeDto.projectId,
              executeDto.agentType,
              response.content,
              userId,
            );

            // If there were critical errors or warnings, emit via WebSocket
            if (
              postProcessResult.criticalErrors.length > 0 ||
              postProcessResult.warnings.length > 0
            ) {
              const allWarnings = [
                ...postProcessResult.criticalErrors,
                ...postProcessResult.warnings,
              ];

              // Store warning info in contextData
              const currentAgent = await this.prisma.agent.findUnique({
                where: { id: executionId },
                select: { contextData: true },
              });
              await this.prisma.agent.update({
                where: { id: executionId },
                data: {
                  contextData: {
                    ...((currentAgent?.contextData as object) || {}),
                    postProcessingErrors: allWarnings,
                    postProcessingResult: {
                      documentsCreated: postProcessResult.documentsCreated,
                      filesWritten: postProcessResult.filesWritten,
                      handoffsCreated: postProcessResult.handoffsCreated,
                    },
                    hasPostProcessingWarnings: true,
                  } as any,
                },
              });

              // Emit warning event via WebSocket so frontend can show user what failed
              this.wsGateway.emitAgentCompletedWithWarnings(
                executeDto.projectId,
                executionId,
                response,
                allWarnings.map((e) => ({
                  operation: e.operation,
                  message: e.message,
                  severity: e.severity,
                })),
                executeDto.agentType,
              );
            }

            streamCallback.onComplete(response);
          },
          onError: async (error) => {
            // Update agent execution with error
            await this.prisma.agent.update({
              where: { id: executionId },
              data: {
                status: 'FAILED',
                outputResult: error.message,
                completedAt: new Date(),
              },
            });

            streamCallback.onError(error);
          },
        },
        executeDto.model || template.defaultModel,
        template.maxTokens,
      )
      .catch((error) => {
        console.error('Streaming execution error:', error);
        streamCallback.onError(error);
      });

    // Return the execution ID immediately, streaming continues in background
    return executionId;
  }

  /**
   * Handle successful agent completion (shared by both standard and tool-enabled execution)
   */
  private async handleAgentCompletion(
    executionId: string,
    executeDto: ExecuteAgentDto,
    template: any,
    context: AgentExecutionContext,
    systemPrompt: string,
    response: {
      content: string;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
      finishReason: string;
    },
    streamCallback: AIProviderStreamCallback,
    userId: string,
  ): Promise<void> {
    // Update agent execution record
    await this.prisma.agent.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        outputResult: response.content,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        completedAt: new Date(),
      },
    });

    // Track cost and update COST_LOG document (non-critical)
    try {
      const currentGate = context.currentGate || 'G1_PENDING';
      const model = executeDto.model || template.defaultModel;
      const costResult = await this.costTracking.logAgentCost(
        executeDto.projectId,
        executeDto.agentType,
        currentGate,
        model,
        response.usage.inputTokens,
        response.usage.outputTokens,
      );
      this.logger.log(
        `[CostTracking] ${executeDto.agentType} cost: $${costResult.cost.toFixed(4)}, total: $${costResult.totalProjectCost.toFixed(4)}`,
      );
    } catch (error) {
      this.logger.warn('Cost tracking failed (non-critical):', error);
    }

    // Update Agent Log document (non-critical)
    try {
      await this.updateAgentLogDocument(
        executeDto.projectId,
        executeDto.agentType,
        context.currentGate || 'G1_PENDING',
        'Complete',
      );
    } catch (error) {
      this.logger.warn('Agent log update failed (non-critical):', error);
    }

    // Save full agent memory for context recovery (non-critical)
    try {
      await this.agentMemory.saveAgentMemory({
        projectId: executeDto.projectId,
        agentId: executionId,
        agentType: executeDto.agentType,
        gateType: context.currentGate || 'G1_PENDING',
        systemPrompt: systemPrompt,
        userPrompt: executeDto.userPrompt,
        response: response.content,
        documentsUsed: context.availableDocuments || [],
        model: executeDto.model || template.defaultModel,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      });
      this.logger.log(`[AgentMemory] Saved memory for ${executeDto.agentType}`);
    } catch (error) {
      this.logger.warn('Agent memory save failed (non-critical):', error);
    }

    // Post-processing: Generate documents and handle handoffs (critical - report failures)
    const postProcessResult = await this.postProcessAgentCompletion(
      executionId,
      executeDto.projectId,
      executeDto.agentType,
      response.content,
      userId,
    );

    // If there were critical errors or warnings, emit via WebSocket
    if (postProcessResult.criticalErrors.length > 0 || postProcessResult.warnings.length > 0) {
      const allWarnings = [...postProcessResult.criticalErrors, ...postProcessResult.warnings];

      // Store warning info in contextData (status stays COMPLETED since schema doesn't have COMPLETED_WITH_ERRORS)
      const currentAgent = await this.prisma.agent.findUnique({
        where: { id: executionId },
        select: { contextData: true },
      });
      await this.prisma.agent.update({
        where: { id: executionId },
        data: {
          contextData: {
            ...((currentAgent?.contextData as object) || {}),
            postProcessingErrors: allWarnings,
            postProcessingResult: {
              documentsCreated: postProcessResult.documentsCreated,
              filesWritten: postProcessResult.filesWritten,
              handoffsCreated: postProcessResult.handoffsCreated,
            },
            hasPostProcessingWarnings: true,
          } as any,
        },
      });

      // Emit warning event via WebSocket so frontend can show user what failed
      this.wsGateway.emitAgentCompletedWithWarnings(
        executeDto.projectId,
        executionId,
        response,
        allWarnings.map((e) => ({
          operation: e.operation,
          message: e.message,
          severity: e.severity,
        })),
        executeDto.agentType,
      );

      // Also call the normal completion callback so streaming completes
      streamCallback.onComplete(response);
    } else {
      // No issues - emit normal completion
      streamCallback.onComplete(response);
    }
  }

  /**
   * Handle agent execution error (shared by both standard and tool-enabled execution)
   */
  private async handleAgentError(
    executionId: string,
    error: Error,
    streamCallback: AIProviderStreamCallback,
  ): Promise<void> {
    this.logger.error(`Agent execution error: ${error.message}`);

    // Update agent execution with error
    await this.prisma.agent.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        outputResult: error.message,
        completedAt: new Date(),
      },
    });

    streamCallback.onError(error);
  }

  private buildSystemPromptFromNewTemplate(
    template: any,
    context: AgentExecutionContext,
    teachingLevel?: TeachingLevel,
  ): string {
    // Phase 5: Add teaching level instructions if available
    const teachingInstructions = teachingLevel ? TEACHING_LEVEL_INSTRUCTIONS[teachingLevel] : '';

    return `${template.systemPrompt}

## Current Project Context

- **Project ID**: ${context.projectId}
- **Current Phase**: ${context.currentPhase}
- **Current Gate**: ${context.currentGate}
- **Available Documents**: ${context.availableDocuments.join(', ') || 'None'}
${teachingInstructions}

## MCP Tools Available

You have access to the following tools during execution. Use them to:
- **get_context_for_story**: Fetch relevant context on demand (more efficient than pre-loaded context)
- **register_spec**: Explicitly register specs (OpenAPI, Prisma, Zod) - preferred over markdown output
- **check_spec_integrity**: Validate specs align before development starts
- **create_query**: Ask questions to other agents when you need clarification
- **record_decision**: Log important decisions with rationale
- **get_documents**: Fetch specific documents by type
- **record_handoff**: Document handoff to the next agent

---

Now, please proceed with your task.`;
  }

  private async buildExecutionContext(
    projectId: string,
    userId: string,
  ): Promise<AgentExecutionContext> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        state: true,
        documents: {
          select: { id: true, title: true, documentType: true },
        },
        specifications: {
          select: { id: true, name: true, specificationType: true },
        },
        gates: {
          select: { id: true, gateType: true, status: true },
        },
      },
    });

    return {
      projectId,
      userId,
      currentGate: project.state?.currentGate || 'G1_PENDING',
      currentPhase: project.state?.currentPhase || 'pre_startup',
      projectState: project.state,
      availableDocuments: project.documents.map((d) => d.title),
    };
  }

  private buildSystemPrompt(template: any, context: AgentExecutionContext): string {
    return `${template.prompt.role}

## Current Context

- **Project ID**: ${context.projectId}
- **Current Phase**: ${context.currentPhase}
- **Current Gate**: ${context.currentGate}
- **Available Documents**: ${context.availableDocuments.join(', ') || 'None'}

## Your Responsibilities

${template.prompt.responsibilities.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}

## Available MCP Tools

${template.prompt.mcpTools.join(', ')}

## Output Formats

You should produce the following outputs:
${template.prompt.outputFormats.join(', ')}

## Constraints

${template.prompt.constraints.map((c: string) => `- ${c}`).join('\n')}

---

${template.prompt.context}
`;
  }

  private async parseAgentOutput(
    output: string,
    _projectId: string,
    _userId: string,
  ): Promise<AgentExecutionResult> {
    // This is a simplified parser
    // In production, you'd want more sophisticated parsing to extract:
    // - Documents to create/update
    // - Tasks to create
    // - Decisions recorded
    // - Next agent to call
    // - Gate readiness

    const result: AgentExecutionResult = {
      success: true,
      output,
      documentsCreated: [],
      documentsUpdated: [],
      tasksCreated: [],
      decisionsRecorded: [],
    };

    // Check if output indicates gate is ready
    if (output.includes('Gate') && output.includes('ready')) {
      result.gateReady = true;
    }

    // Check if output mentions handoff to another agent
    const handoffMatch = output.match(/handoff to (\w+)/i);
    if (handoffMatch) {
      result.nextAgent = handoffMatch[1];
    }

    return result;
  }

  async getAgentHistory(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view agents for your own projects');
    }

    return await this.prisma.agent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }, // Oldest first for conversation history
      take: 100,
    });
  }

  async getAgentExecution(id: string, userId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        project: true,
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent execution not found');
    }

    if (agent.project.ownerId !== userId) {
      throw new ForbiddenException('You can only view agent executions for your own projects');
    }

    return agent;
  }

  /**
   * Post-process agent completion: Generate documents, extract code files, and prepare handoffs
   * Returns a result object indicating what succeeded and what failed
   */
  private async postProcessAgentCompletion(
    agentExecutionId: string,
    projectId: string,
    agentType: string,
    agentOutput: string,
    userId: string,
  ): Promise<PostProcessingResult> {
    const result: PostProcessingResult = {
      success: true,
      documentsCreated: [],
      filesWritten: [],
      handoffsCreated: [],
      tasksUpdated: 0,
      deliverablesCompleted: 0,
      errors: [],
      criticalErrors: [],
      warnings: [],
    };

    const addError = (
      operation: string,
      message: string,
      severity: 'critical' | 'warning' | 'info',
      details?: Record<string, unknown>,
    ) => {
      const error: PostProcessingError = { operation, message, severity, details };
      result.errors.push(error);
      if (severity === 'critical') {
        result.criticalErrors.push(error);
        result.success = false;
      } else if (severity === 'warning') {
        result.warnings.push(error);
      }
      this.logger.error(`[PostProcess:${severity}] ${operation}: ${message}`);
    };

    // 1. Generate documents from agent output
    // Skip for agents that have custom document handling in workflow-coordinator
    // to prevent duplicate document creation
    const agentsWithCustomDocHandling = [
      'PRODUCT_MANAGER', // PRD saved via savePRDDocument in workflow-coordinator
      'PRODUCT_MANAGER_ONBOARDING', // Intake saved via handleOnboardingComplete
      'ORCHESTRATOR', // Output saved to ORCHESTRATOR-Output log, not as separate docs
    ];

    if (!agentsWithCustomDocHandling.includes(agentType)) {
      try {
        const docs = await this.documentsService.generateFromAgentOutput(
          projectId,
          agentExecutionId,
          agentType,
          agentOutput,
          userId,
        );
        if (docs && Array.isArray(docs)) {
          result.documentsCreated = docs.map((d) => d.title || d.id);
        }
      } catch (error) {
        // Document generation is critical for agents that should produce docs
        const docProducingAgents = ['ARCHITECT', 'PRODUCT_MANAGER', 'SECURITY_ENGINEER'];
        const severity = docProducingAgents.includes(agentType) ? 'critical' : 'warning';
        addError(
          'Document Generation',
          error.message || 'Failed to generate documents from agent output',
          severity,
          { agentType },
        );
      }
    }

    // 2. Extract and write code files
    const codeGenerationAgents = [
      'FRONTEND_DEVELOPER',
      'BACKEND_DEVELOPER',
      'ML_ENGINEER',
      'DATA_ENGINEER',
      'DEVOPS_ENGINEER',
    ];

    if (codeGenerationAgents.includes(agentType)) {
      try {
        // Parse code blocks from agent output
        const extractionResult = this.codeParser.extractFiles(agentOutput);

        if (extractionResult.files.length > 0) {
          this.logger.log(`[${agentType}] Extracted ${extractionResult.files.length} code files`);

          // Ensure project workspace exists
          await this.filesystem.createProjectWorkspace(projectId);

          // Write all extracted files
          for (const file of extractionResult.files) {
            try {
              await this.filesystem.writeFile(projectId, file.path, file.content);
              result.filesWritten.push(file.path);
              this.logger.log(`[${agentType}] Wrote file: ${file.path}`);
            } catch (fileError) {
              addError(
                'File Write',
                `Failed to write file ${file.path}: ${fileError.message}`,
                'critical',
                { filePath: file.path },
              );
            }
          }

          // Record extracted files in agent execution metadata
          const currentAgent = await this.prisma.agent.findUnique({
            where: { id: agentExecutionId },
            select: { contextData: true },
          });
          const currentContextData = currentAgent?.contextData || {};
          await this.prisma.agent.update({
            where: { id: agentExecutionId },
            data: {
              contextData: {
                ...(typeof currentContextData === 'object' ? currentContextData : {}),
                filesGenerated: result.filesWritten,
              } as any,
            },
          });

          // If this is a gate-critical agent (G5 Development), run validation
          const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            include: { state: true },
          });

          if (
            project?.state?.currentGate === 'G5_PENDING' &&
            (agentType === 'FRONTEND_DEVELOPER' || agentType === 'BACKEND_DEVELOPER')
          ) {
            this.logger.log(`[${agentType}] Running build validation for G5 gate...`);

            try {
              // Run full validation pipeline
              const validationResult = await this.buildExecutor.runFullValidation(projectId);

              // Create proof artifact with build results
              await this.prisma.proofArtifact.create({
                data: {
                  projectId,
                  gateId: await this.getGateId(projectId, 'G5_PENDING'),
                  gate: 'G5_PENDING',
                  proofType: 'build_output',
                  filePath: `builds/${agentType}-validation.json`,
                  fileHash: 'sha256-placeholder', // Would compute actual hash
                  contentSummary: `Build validation ${validationResult.overallSuccess ? 'passed' : 'failed'}`,
                  passFail: validationResult.overallSuccess ? 'pass' : 'fail',
                  createdBy: agentType,
                },
              });

              this.logger.log(
                `[${agentType}] Validation ${validationResult.overallSuccess ? 'PASSED' : 'FAILED'}`,
              );

              // If validation failed, create error history entry and trigger auto-retry
              if (!validationResult.overallSuccess) {
                const errors = [
                  ...validationResult.build.errors,
                  ...validationResult.tests.errors,
                  ...validationResult.lint.errors,
                ];

                for (const error of errors.slice(0, 5)) {
                  // Limit to 5 errors
                  await this.prisma.errorHistory.create({
                    data: {
                      projectId,
                      errorType: 'build',
                      errorMessage: error,
                      contextJson: JSON.stringify({
                        agentType,
                        validationPhase: 'build',
                        agentExecutionId,
                      }),
                    },
                  });
                }

                // Trigger automatic self-healing retry
                this.logger.log(
                  `[${agentType}] Build validation failed. Triggering self-healing...`,
                );

                try {
                  const healingSuccess = await this.retryService.autoRetryOnBuildFailure(
                    projectId,
                    agentExecutionId,
                    userId,
                  );

                  if (healingSuccess) {
                    this.logger.log(`[${agentType}] Self-healing succeeded. Code is now valid.`);
                  } else {
                    this.logger.log(
                      `[${agentType}] Self-healing failed. Human intervention required.`,
                    );
                    addError(
                      'Build Validation',
                      'Build validation failed and self-healing was unsuccessful',
                      'warning',
                      { errors: errors.slice(0, 3) },
                    );
                  }
                } catch (retryError) {
                  addError(
                    'Self-Healing',
                    retryError.message || 'Self-healing process failed',
                    'warning',
                    { originalErrors: errors.slice(0, 3) },
                  );
                }
              }
            } catch (error) {
              addError(
                'Build Validation',
                error.message || 'Failed to run build validation',
                'warning',
                { gate: 'G5_PENDING' },
              );
            }
          }
        } else {
          const unparsedCount = extractionResult.unparsedBlocks?.length || 0;
          this.logger.log(
            `[${agentType}] No code files extracted from output (${unparsedCount} unparsed blocks)`,
          );
          // This is a warning for code generation agents - they should produce code
          if (unparsedCount > 0) {
            addError(
              'Code Extraction',
              `No valid code files extracted (${unparsedCount} unparsed code blocks found)`,
              'warning',
              { unparsedBlocks: unparsedCount },
            );
          }
        }
      } catch (error) {
        // Code extraction failure is critical for code generation agents
        addError(
          'Code Extraction',
          error.message || 'Failed to extract code files from agent output',
          'critical',
          { agentType },
        );
      }
    }

    // 3. Extract handoff data
    const handoffData = this.documentsService.extractHandoffData(agentOutput);

    if (handoffData && handoffData.nextAgent?.length > 0) {
      // Get current gate
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { state: true },
      });

      if (!project || !project.state) {
        addError(
          'Handoff Creation',
          'Could not find project state for handoff creation',
          'warning',
          { projectId },
        );
      } else {
        // Create handoff record for each next agent
        for (const nextAgent of handoffData.nextAgent) {
          try {
            // Use transaction to ensure handoff and deliverables are created atomically
            await this.prisma.$transaction(async (tx) => {
              const handoff = await tx.handoff.create({
                data: {
                  projectId,
                  fromAgent: agentType,
                  toAgent: nextAgent,
                  phase: project.state.currentPhase,
                  status: 'partial',
                  notes: handoffData.nextAction || 'Agent handoff',
                },
              });

              // Create handoff deliverables using the handoff ID directly
              if (handoffData.deliverables?.length > 0) {
                await tx.handoffDeliverable.createMany({
                  data: handoffData.deliverables.map((deliverable) => ({
                    handoffId: handoff.id,
                    deliverable,
                  })),
                });
              }
            });

            result.handoffsCreated.push(`${agentType} -> ${nextAgent}`);
          } catch (error) {
            // Handoff failures are critical - they break the workflow
            addError(
              'Handoff Creation',
              `Failed to create handoff to ${nextAgent}: ${error.message}`,
              'critical',
              { fromAgent: agentType, toAgent: nextAgent },
            );
          }
        }
      }
    }

    // 4. Update task status if this agent was assigned a task
    try {
      const taskResult = await this.prisma.task.updateMany({
        where: {
          projectId,
          owner: agentType,
          status: TaskStatus.in_progress,
        },
        data: {
          status: TaskStatus.complete,
          completedAt: new Date(),
        },
      });
      result.tasksUpdated = taskResult.count;
    } catch (error) {
      // Task updates are non-critical
      addError('Task Update', error.message || 'Failed to update task status', 'info', {
        agentType,
      });
    }

    // 5. Mark agent's deliverables as complete
    try {
      const deliverableResult = await this.prisma.deliverable.updateMany({
        where: {
          projectId,
          owner: agentType,
          status: { not: 'complete' },
        },
        data: {
          status: 'complete',
        },
      });
      result.deliverablesCompleted = deliverableResult.count;

      if (deliverableResult.count > 0) {
        this.logger.log(
          `[${agentType}] Marked ${deliverableResult.count} deliverable(s) as complete`,
        );
      }
    } catch (error) {
      // Deliverable updates are non-critical
      addError(
        'Deliverable Update',
        error.message || 'Failed to update deliverable status',
        'info',
        { agentType },
      );
    }

    return result;
  }

  /**
   * Helper method to get gate ID by gate type
   */
  private async getGateId(projectId: string, gateType: string): Promise<string> {
    const gate = await this.prisma.gate.findFirst({
      where: {
        projectId,
        gateType,
      },
    });

    return gate?.id || null;
  }

  /**
   * Update the Agent Log document with a new execution entry
   */
  private async updateAgentLogDocument(
    projectId: string,
    agentType: string,
    gateType: string,
    outcome: string,
  ): Promise<void> {
    // Find the Agent Log document
    const agentLogDoc = await this.prisma.document.findFirst({
      where: {
        projectId,
        title: 'Agent Log',
      },
    });

    if (!agentLogDoc) {
      console.log('[AgentLog] Agent Log document not found for project:', projectId);
      return;
    }

    // Format agent name for display
    const agentDisplay = agentType
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    // Get current timestamp
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

    // Build new table row
    const newRow = `| ${timestamp} | ${gateType} | ${agentDisplay} | Agent execution | - | ${outcome} |`;

    // Parse current content and insert new row
    let content = agentLogDoc.content;

    // Find the "Agent Executions" table and add the new row
    const tableMatch = content.match(
      /## Agent Executions\s*\n\n\| Timestamp \| Gate \| Agent \| Task \| Duration \| Outcome \|\n\|[-|\s]+\|\n([\s\S]*?)\n\n---/,
    );

    if (tableMatch) {
      const existingRows = tableMatch[1].trim();
      let newTableContent: string;

      // Check if it's just the placeholder row
      if (existingRows.includes('| Started') && existingRows.split('\n').length === 1) {
        // Replace placeholder with actual data
        newTableContent = newRow;
      } else {
        // Append new row
        newTableContent = existingRows + '\n' + newRow;
      }

      content = content.replace(
        /## Agent Executions\s*\n\n\| Timestamp \| Gate \| Agent \| Task \| Duration \| Outcome \|\n\|[-|\s]+\|\n[\s\S]*?\n\n---/,
        `## Agent Executions

| Timestamp | Gate | Agent | Task | Duration | Outcome |
|-----------|------|-------|------|----------|---------|
${newTableContent}

---`,
      );
    }

    // Update the document
    await this.prisma.document.update({
      where: { id: agentLogDoc.id },
      data: {
        content,
        updatedAt: new Date(),
      },
    });

    console.log(`[AgentLog] Updated Agent Log: ${agentDisplay} at ${gateType} - ${outcome}`);
  }
}
