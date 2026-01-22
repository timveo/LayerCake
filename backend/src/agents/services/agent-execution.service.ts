import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import { AgentTemplateLoaderService } from './agent-template-loader.service';
import { AIProviderService, AIProviderStreamCallback } from './ai-provider.service';
import {
  AgentExecutionContext,
  AgentExecutionResult,
} from '../interfaces/agent-template.interface';
import { ExecuteAgentDto } from '../dto/execute-agent.dto';
import { getAgentTemplate } from '../templates';
import { DocumentsService } from '../../documents/documents.service';
import { CodeParserService } from '../../code-generation/code-parser.service';
import { FileSystemService } from '../../code-generation/filesystem.service';
import { BuildExecutorService } from '../../code-generation/build-executor.service';
import { AgentRetryService } from './agent-retry.service';

@Injectable()
export class AgentExecutionService {
  constructor(
    private prisma: PrismaService,
    private templateLoader: AgentTemplateLoaderService,
    private aiProvider: AIProviderService,
    private documentsService: DocumentsService,
    private codeParser: CodeParserService,
    private filesystem: FileSystemService,
    private buildExecutor: BuildExecutorService,
    private retryService: AgentRetryService,
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

    // Increment user's monthly execution count
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        monthlyAgentExecutions: {
          increment: 1,
        },
      },
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

    // Check monthly execution limit
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
      const error = new BadRequestException(
        `Monthly agent execution limit reached. Your ${user.planTier} plan allows ${executionLimit} executions per month.`,
      );
      streamCallback.onError(error);
      throw error;
    }

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

    // Build system prompt from template
    const systemPrompt = this.buildSystemPromptFromNewTemplate(template, context);

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

            // Post-processing: Generate documents and handle handoffs
            try {
              await this.postProcessAgentCompletion(
                executionId,
                executeDto.projectId,
                executeDto.agentType,
                response.content,
                userId,
              );
            } catch (error) {
              console.error('Post-processing error:', error);
              // Don't fail the entire execution if post-processing fails
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

  private buildSystemPromptFromNewTemplate(template: any, context: AgentExecutionContext): string {
    return `${template.systemPrompt}

## Current Project Context

- **Project ID**: ${context.projectId}
- **Current Phase**: ${context.currentPhase}
- **Current Gate**: ${context.currentGate}
- **Available Documents**: ${context.availableDocuments.join(', ') || 'None'}

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
   */
  private async postProcessAgentCompletion(
    agentExecutionId: string,
    projectId: string,
    agentType: string,
    agentOutput: string,
    userId: string,
  ): Promise<void> {
    // 1. Generate documents from agent output
    try {
      await this.documentsService.generateFromAgentOutput(
        projectId,
        agentExecutionId,
        agentType,
        agentOutput,
        userId,
      );
    } catch (error) {
      console.error('Document generation error:', error);
    }

    // 2. Extract and write code files (NEW)
    const codeGenerationAgents = [
      'frontend-developer',
      'backend-developer',
      'ml-engineer',
      'data-engineer',
      'devops-engineer',
    ];

    if (codeGenerationAgents.includes(agentType)) {
      try {
        // Parse code blocks from agent output
        const extractionResult = this.codeParser.extractFiles(agentOutput);

        if (extractionResult.files.length > 0) {
          console.log(`[${agentType}] Extracted ${extractionResult.files.length} code files`);

          // Ensure project workspace exists
          await this.filesystem.createProjectWorkspace(projectId);

          // Write all extracted files
          for (const file of extractionResult.files) {
            await this.filesystem.writeFile(projectId, file.path, file.content);
            console.log(`[${agentType}] Wrote file: ${file.path}`);
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
                filesGenerated: extractionResult.files.map((f) => f.path),
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
            (agentType === 'frontend-developer' || agentType === 'backend-developer')
          ) {
            console.log(`[${agentType}] Running build validation for G5 gate...`);

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

              console.log(
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
                console.log(`[${agentType}] Build validation failed. Triggering self-healing...`);

                try {
                  const healingSuccess = await this.retryService.autoRetryOnBuildFailure(
                    projectId,
                    agentExecutionId,
                    userId,
                  );

                  if (healingSuccess) {
                    console.log(`[${agentType}] Self-healing succeeded. Code is now valid.`);
                  } else {
                    console.log(`[${agentType}] Self-healing failed. Human intervention required.`);
                  }
                } catch (retryError) {
                  console.error('Self-healing error:', retryError);
                }
              }
            } catch (error) {
              console.error('Build validation error:', error);
            }
          }
        } else {
          console.log(
            `[${agentType}] No code files extracted from output (${extractionResult.unparsedBlocks} unparsed blocks)`,
          );
        }
      } catch (error) {
        console.error('Code extraction error:', error);
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
        return;
      }

      // Create handoff record for each next agent
      for (const nextAgent of handoffData.nextAgent) {
        try {
          await this.prisma.handoff.create({
            data: {
              projectId,
              fromAgent: agentType,
              toAgent: nextAgent,
              phase: project.state.currentPhase,
              status: 'partial',
              notes: handoffData.nextAction || 'Agent handoff',
            },
          });

          // Create handoff deliverables
          if (handoffData.deliverables?.length > 0) {
            const handoff = await this.prisma.handoff.findFirst({
              where: {
                projectId,
                fromAgent: agentType,
                toAgent: nextAgent,
              },
              orderBy: { createdAt: 'desc' },
            });

            if (handoff) {
              for (const deliverable of handoffData.deliverables) {
                await this.prisma.handoffDeliverable.create({
                  data: {
                    handoffId: handoff.id,
                    deliverable,
                  },
                });
              }
            }
          }
        } catch (error) {
          console.error('Handoff creation error:', error);
        }
      }
    }

    // 4. Update task status if this agent was assigned a task
    try {
      await this.prisma.task.updateMany({
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
    } catch (error) {
      console.error('Task update error:', error);
    }
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
}
