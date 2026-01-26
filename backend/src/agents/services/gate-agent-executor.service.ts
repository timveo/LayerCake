import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgentExecutionService } from './agent-execution.service';
import { ToolEnabledAIProviderService } from './tool-enabled-ai-provider.service';
import { EventStoreService } from '../../events/event-store.service';
import { SessionContextService } from '../../session-context/session-context.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { getAgentTaskDescription, getDeliverablesForGate } from '../../gates/gate-config';
import { GateContext } from '../../universal-input/dto/gate-recommendation.dto';
import { getAgentTemplate } from '../templates';
import { FileSystemService, DirectoryStructure } from '../../code-generation/filesystem.service';

/**
 * GateAgentExecutorService handles agent execution for gates,
 * including prompt building and handoff context management.
 *
 * Extracted from WorkflowCoordinatorService for better separation of concerns.
 */
@Injectable()
export class GateAgentExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentExecutionService))
    private readonly agentExecution: AgentExecutionService,
    private readonly toolEnabledAiProvider: ToolEnabledAIProviderService,
    private readonly eventStore: EventStoreService,
    private readonly sessionContext: SessionContextService,
    private readonly filesystem: FileSystemService,
    @Inject(forwardRef(() => AppWebSocketGateway))
    private readonly wsGateway: AppWebSocketGateway,
  ) {}

  /**
   * Execute a single agent for a gate
   */
  async executeSingleAgent(
    projectId: string,
    agentType: string,
    gateType: string,
    userId: string,
    handoffContext: string,
    callbacks?: {
      onRetry?: (
        projectId: string,
        agentType: string,
        gateType: string,
        userId: string,
        handoffContext: string,
      ) => Promise<void>;
      getRetryCount?: (projectId: string, agentType: string, gateType: string) => Promise<number>;
      markDeliverablesComplete?: (projectId: string, agentType: string) => Promise<void>;
    },
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    // Create deliverables for this agent before execution
    await this.createAgentDeliverables(projectId, project.type, agentType, gateType);

    // Get task description for this agent at this gate
    const taskDescription = getAgentTaskDescription(agentType, gateType);

    // Build the agent prompt with handoff context
    const userPrompt = await this.buildAgentPrompt(
      projectId,
      taskDescription,
      handoffContext,
      project,
    );

    console.log(`[GateAgentExecutor] Starting agent ${agentType} for gate ${gateType}`);

    // Log agent start event
    await this.eventStore.appendEvent(projectId, {
      type: 'AgentStarted',
      data: { agentType, gateType, taskDescription },
      userId,
    });

    // Track if we've sent the first chunk (to emit "working" progress)
    let hasEmittedWorkingProgress = false;

    // Get human-readable progress messages for this agent
    const getProgressMessage = (phase: 'start' | 'working' | 'finalizing'): string => {
      const agentMessages: Record<string, Record<string, string>> = {
        ARCHITECT: {
          start: 'Analyzing requirements and designing system architecture...',
          working: 'Creating OpenAPI spec, database schema, and architecture docs...',
          finalizing: 'Finalizing architecture deliverables...',
        },
        UX_UI_DESIGNER: {
          start: 'Reviewing requirements and planning design system...',
          working: 'Creating wireframes, mockups, and design system...',
          finalizing: 'Finalizing design deliverables...',
        },
        FRONTEND_DEVELOPER: {
          start: 'Reviewing architecture and design specs...',
          working: 'Implementing frontend components and pages...',
          finalizing: 'Finalizing frontend code...',
        },
        BACKEND_DEVELOPER: {
          start: 'Reviewing architecture and API specs...',
          working: 'Implementing API endpoints and business logic...',
          finalizing: 'Finalizing backend code...',
        },
        QA_ENGINEER: {
          start: 'Reviewing code and creating test plan...',
          working: 'Writing and executing tests...',
          finalizing: 'Finalizing test results...',
        },
        SECURITY_ENGINEER: {
          start: 'Preparing security audit...',
          working: 'Scanning for vulnerabilities and security issues...',
          finalizing: 'Finalizing security report...',
        },
        DEVOPS_ENGINEER: {
          start: 'Reviewing deployment requirements...',
          working: 'Configuring CI/CD and deployment...',
          finalizing: 'Finalizing deployment...',
        },
      };
      return agentMessages[agentType]?.[phase] || `${agentType.replace(/_/g, ' ')} is working...`;
    };

    // Check if agent template has tool use enabled
    const template = getAgentTemplate(agentType);
    const useToolExecution = template?.useTools === true;

    // For UX_UI_DESIGNER with tool use: use tool-enabled provider
    if (agentType === 'UX_UI_DESIGNER' && useToolExecution) {
      await this.executeUxUiDesignerWithTools(
        projectId,
        agentType,
        gateType,
        userId,
        userPrompt,
        template,
        getProgressMessage,
        callbacks,
        handoffContext,
      );
      return;
    }

    // Standard agent execution (non-tool-use agents)
    // IMPORTANT: Wrap in a Promise to wait for actual completion
    // executeAgentStream returns immediately (fire-and-forget), but we need to wait
    // for onComplete to be called before returning to executeGateAgents
    await new Promise<void>((resolve, reject) => {
      let agentExecutionId: string;

      this.agentExecution
        .executeAgentStream(
          {
            projectId,
            agentType,
            userPrompt,
            model: undefined, // Use template default
          },
          userId,
          {
            onChunk: (chunk: string) => {
              // Emit "working" progress on first chunk received
              if (!hasEmittedWorkingProgress) {
                hasEmittedWorkingProgress = true;
                this.wsGateway.emitAgentProgress(
                  projectId,
                  agentExecutionId,
                  agentType,
                  getProgressMessage('working'),
                );
              }
              this.wsGateway.emitAgentChunk(projectId, agentExecutionId, chunk);
            },
            onComplete: async (response) => {
              try {
                // Emit finalizing progress
                this.wsGateway.emitAgentProgress(
                  projectId,
                  agentExecutionId,
                  agentType,
                  getProgressMessage('finalizing'),
                );

                this.wsGateway.emitAgentCompleted(projectId, agentExecutionId, {
                  content: response.content,
                  usage: response.usage,
                  finishReason: response.finishReason,
                });

                // Mark this agent's deliverables complete
                if (callbacks?.markDeliverablesComplete) {
                  await callbacks.markDeliverablesComplete(projectId, agentType);
                } else {
                  await this.markAgentDeliverablesComplete(projectId, agentType);
                }

                // Log completion event
                await this.eventStore.appendEvent(projectId, {
                  type: 'AgentCompleted',
                  data: {
                    agentId: agentExecutionId,
                    agentType,
                    gateType,
                    tokenUsage: response.usage,
                  },
                  userId,
                });

                console.log(`[GateAgentExecutor] Agent ${agentType} completed for gate ${gateType}`);
                resolve(); // Resolve the Promise when agent completes
              } catch (err) {
                reject(err);
              }
            },
            onError: async (error) => {
              console.error(`[GateAgentExecutor] Agent ${agentType} error:`, error);
              this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);

              // Log failure event
              await this.eventStore.appendEvent(projectId, {
                type: 'AgentFailed',
                data: {
                  agentId: agentExecutionId,
                  agentType,
                  gateType,
                  error: error.message,
                },
                userId,
              });

              // Auto-retry on transient errors (up to 2 retries)
              const isTransientError =
                error.message.includes('model:') ||
                error.message.includes('rate_limit') ||
                error.message.includes('timeout') ||
                error.message.includes('503') ||
                error.message.includes('502');

              if (isTransientError && callbacks?.getRetryCount && callbacks?.onRetry) {
                const retryCount = await callbacks.getRetryCount(projectId, agentType, gateType);
                if (retryCount < 2) {
                  console.log(
                    `[GateAgentExecutor] Auto-retrying ${agentType} (attempt ${retryCount + 1}/2) after transient error`,
                  );
                  // Wait a bit before retrying
                  setTimeout(async () => {
                    try {
                      await callbacks.onRetry!(projectId, agentType, gateType, userId, handoffContext);
                      resolve(); // Resolve after successful retry
                    } catch (retryError) {
                      console.error(`[GateAgentExecutor] Retry failed for ${agentType}:`, retryError);
                      reject(retryError);
                    }
                  }, 3000);
                  return; // Don't reject yet - waiting for retry
                }
              }
              reject(error); // Reject the Promise on error (if not retrying)
            },
          },
        )
        .then((id) => {
          agentExecutionId = id;
        })
        .catch(reject);
    });
  }

  /**
   * Execute UX/UI Designer using tool-enabled AI provider
   * Designs are saved via tool calls (save_design_concept) - no parsing needed
   */
  private async executeUxUiDesignerWithTools(
    projectId: string,
    agentType: string,
    gateType: string,
    userId: string,
    userPrompt: string,
    template: { systemPrompt: string; defaultModel: string; maxTokens: number },
    getProgressMessage: (phase: 'start' | 'working' | 'finalizing') => string,
    callbacks?: {
      onRetry?: (
        projectId: string,
        agentType: string,
        gateType: string,
        userId: string,
        handoffContext: string,
      ) => Promise<void>;
      getRetryCount?: (projectId: string, agentType: string, gateType: string) => Promise<number>;
      markDeliverablesComplete?: (projectId: string, agentType: string) => Promise<void>;
    },
    handoffContext?: string,
  ): Promise<void> {
    console.log(`[GateAgentExecutor] Starting UX_UI_DESIGNER with tool use for ${gateType}`);

    // Create agent execution record
    const agentRecord = await this.prisma.agent.create({
      data: {
        projectId,
        agentType,
        status: 'RUNNING',
        inputPrompt: userPrompt.substring(0, 5000),
        model: template.defaultModel,
      },
    });
    const agentExecutionId = agentRecord.id;

    // Emit agent started
    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      agentType,
      getProgressMessage('start'),
    );

    // Clear existing designs before new generation
    await this.prisma.designConcept.deleteMany({ where: { projectId } });
    console.log(`[GateAgentExecutor] Cleared existing designs for project ${projectId}`);

    let hasEmittedWorkingProgress = false;

    try {
      // Execute with tools - designs are saved via save_design_concept tool calls
      await this.toolEnabledAiProvider.executeWithToolsStream(
        template.systemPrompt,
        userPrompt,
        projectId,
        agentType,
        {
          onChunk: (chunk: string) => {
            if (!hasEmittedWorkingProgress) {
              hasEmittedWorkingProgress = true;
              this.wsGateway.emitAgentProgress(
                projectId,
                agentExecutionId,
                agentType,
                getProgressMessage('working'),
              );
            }
            this.wsGateway.emitAgentChunk(projectId, agentExecutionId, chunk);
          },
          onComplete: async (response) => {
            // Emit finalizing progress
            this.wsGateway.emitAgentProgress(
              projectId,
              agentExecutionId,
              agentType,
              getProgressMessage('finalizing'),
            );

            // Verify 3 designs were saved via tool calls
            const designCount = await this.prisma.designConcept.count({ where: { projectId } });
            console.log(
              `[GateAgentExecutor] UX_UI_DESIGNER saved ${designCount} designs via tools`,
            );

            if (designCount < 3) {
              // Not enough designs - trigger retry
              const errorMessage = `Expected 3 designs, only ${designCount} were saved. Retrying...`;
              console.error(`[GateAgentExecutor] ${errorMessage}`);

              await this.prisma.agent.update({
                where: { id: agentExecutionId },
                data: { status: 'FAILED', outputResult: errorMessage },
              });

              this.wsGateway.emitAgentFailed(projectId, agentExecutionId, errorMessage);

              // Trigger retry if available
              if (callbacks?.getRetryCount && callbacks?.onRetry && handoffContext) {
                const retryCount = await callbacks.getRetryCount(projectId, agentType, gateType);
                if (retryCount < 2) {
                  console.log(
                    `[GateAgentExecutor] Auto-retrying ${agentType} (attempt ${retryCount + 1}/2)`,
                  );
                  setTimeout(async () => {
                    try {
                      await callbacks.onRetry!(
                        projectId,
                        agentType,
                        gateType,
                        userId,
                        handoffContext,
                      );
                    } catch (retryError) {
                      console.error(`[GateAgentExecutor] Retry failed:`, retryError);
                    }
                  }, 5000);
                }
              }
              return;
            }

            // Success - update agent record
            await this.prisma.agent.update({
              where: { id: agentExecutionId },
              data: {
                status: 'COMPLETED',
                outputResult: `Created ${designCount} design concepts via tool calls`,
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
                completedAt: new Date(),
              },
            });

            this.wsGateway.emitAgentCompleted(
              projectId,
              agentExecutionId,
              {
                content: `Created ${designCount} design concepts`,
                usage: response.usage,
                finishReason: response.finishReason,
              },
              agentType,
            );

            // Emit designs updated event
            this.wsGateway.server
              .to(`project:${projectId}`)
              .emit('designs:updated', { projectId, count: designCount });

            // Mark deliverables complete
            if (callbacks?.markDeliverablesComplete) {
              await callbacks.markDeliverablesComplete(projectId, agentType);
            } else {
              await this.markAgentDeliverablesComplete(projectId, agentType);
            }

            // Log completion event
            await this.eventStore.appendEvent(projectId, {
              type: 'AgentCompleted',
              data: {
                agentId: agentExecutionId,
                agentType,
                gateType,
                designCount,
                tokenUsage: response.usage,
              },
              userId,
            });

            console.log(
              `[GateAgentExecutor] UX_UI_DESIGNER completed with ${designCount} designs for ${gateType}`,
            );
          },
          onError: async (error) => {
            console.error(`[GateAgentExecutor] UX_UI_DESIGNER error:`, error);

            await this.prisma.agent.update({
              where: { id: agentExecutionId },
              data: { status: 'FAILED', outputResult: error.message },
            });

            this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);

            await this.eventStore.appendEvent(projectId, {
              type: 'AgentFailed',
              data: { agentId: agentExecutionId, agentType, gateType, error: error.message },
              userId,
            });
          },
        },
        template.defaultModel,
        template.maxTokens,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[GateAgentExecutor] UX_UI_DESIGNER execution failed:`, errorMessage);

      await this.prisma.agent.update({
        where: { id: agentExecutionId },
        data: { status: 'FAILED', outputResult: errorMessage },
      });

      this.wsGateway.emitAgentFailed(projectId, agentExecutionId, errorMessage);
    }
  }

  /**
   * Build agent prompt with handoff context and workspace structure
   */
  async buildAgentPrompt(
    projectId: string,
    taskDescription: string,
    handoffContext: string,
    project: { name: string; type: string | null },
  ): Promise<string> {
    // Get the current workspace structure so agent knows what exists
    let workspaceStructure = '';
    try {
      const tree = await this.filesystem.getDirectoryTree(projectId);
      workspaceStructure = this.formatDirectoryTree(tree);
    } catch {
      // Workspace might not exist yet
      workspaceStructure = '(No workspace created yet)';
    }

    return `## Project: ${project.name}
Project Type: ${project.type || 'traditional'}

## Current Workspace Structure
\`\`\`
${workspaceStructure}
\`\`\`

**IMPORTANT**: This is a fullstack project. You MUST:
- Put ALL frontend code in the \`frontend/\` directory (e.g., \`frontend/src/components/...\`)
- Put ALL backend code in the \`backend/\` directory (e.g., \`backend/src/modules/...\`)
- NEVER create files in a root \`src/\` folder - always use \`frontend/src/\` or \`backend/src/\`

## Your Task
${taskDescription}

${handoffContext}

## Output Rules
- START your response with the actual deliverable content (code, documents, etc.)
- Do NOT include preamble like "I'll create...", "Let me...", "Based on..."
- Do NOT use <thinking> tags or internal reasoning in output
- Use markdown code fences with filenames for all code/documents
- ALL file paths MUST include the correct prefix (\`frontend/\` or \`backend/\`)`;
  }

  /**
   * Format directory tree for display in prompt
   */
  private formatDirectoryTree(node: DirectoryStructure, indent: string = ''): string {
    let result = `${indent}${node.name}${node.type === 'directory' ? '/' : ''}\n`;

    if (node.children && node.children.length > 0) {
      // Sort: directories first, then files
      const sorted = [...node.children].sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      for (const child of sorted) {
        result += this.formatDirectoryTree(child, indent + '  ');
      }
    }

    return result;
  }

  /**
   * Get handoff context from previous agents
   * Now includes assigned tasks from database as the source of truth
   */
  async getHandoffContext(
    projectId: string,
    currentGateType: string,
    agentType?: string,
  ): Promise<string> {
    // Get recent handoffs
    const handoffs = await this.prisma.handoff.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { handoffDeliverables: true },
    });

    // Get recent documents (prioritized by relevance to current gate)
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { title: true, content: true, documentType: true },
    });

    // Get assigned tasks from database (source of truth)
    const assignedTasks = agentType
      ? await this.prisma.task.findMany({
          where: {
            projectId,
            owner: agentType,
            status: { in: ['not_started', 'in_progress'] },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    // Get session context if available
    let sessionData: { recentDecisions?: unknown[]; activeBlockers?: unknown[] } | null = null;
    try {
      const allContext = await this.sessionContext.getAllContext(projectId);
      // Extract decisions and blockers from context
      const decisions = allContext.filter(
        (c: { contextType: string }) => c.contextType === 'decision',
      );
      const blockers = allContext.filter(
        (c: { contextType: string }) => c.contextType === 'blocker',
      );
      sessionData = {
        recentDecisions: decisions.slice(0, 5),
        activeBlockers: blockers,
      };
    } catch {
      // Session context might not exist yet
    }

    // Build context string
    let context = '## Project Context\n\n';

    // Add assigned tasks from database (source of truth for what agent should do)
    if (assignedTasks.length > 0) {
      context += '### Your Assigned Tasks\n';
      context += 'Complete the following tasks from the project plan:\n';
      for (const task of assignedTasks) {
        const priority = task.priority || 'MEDIUM';
        context += `- [${priority}] ${task.description || task.name}\n`;
      }
      context += '\n';
    }

    // Add handoffs
    if (handoffs.length > 0) {
      context += '### Recent Agent Handoffs\n';
      for (const h of handoffs) {
        context += `- **${h.fromAgent} → ${h.toAgent}**: ${h.notes || 'No notes'}\n`;
        if (h.handoffDeliverables.length > 0) {
          context += `  Deliverables: ${h.handoffDeliverables.map((d) => d.deliverable).join(', ')}\n`;
        }
      }
      context += '\n';
    }

    // Add documents (prioritized for current gate)
    const prioritizedDocs = this.prioritizeDocumentsForGate(documents, currentGateType);
    if (prioritizedDocs.length > 0) {
      context += '### Key Documents\n';
      for (const doc of prioritizedDocs.slice(0, 5)) {
        context += `#### ${doc.title} (${doc.documentType})\n`;
        // Truncate to 3000 chars for context window management
        const truncatedContent = doc.content.substring(0, 3000);
        context += truncatedContent;
        if (doc.content.length > 3000) {
          context += '\n... (truncated)\n';
        }
        context += '\n\n';
      }
    }

    // Add decisions from session context
    if (sessionData?.recentDecisions && Array.isArray(sessionData.recentDecisions)) {
      context += '### Recent Decisions\n';
      context += JSON.stringify(sessionData.recentDecisions, null, 2) + '\n\n';
    }

    // Add blockers from session context
    if (sessionData?.activeBlockers && Array.isArray(sessionData.activeBlockers)) {
      context += '### Active Blockers\n';
      context += JSON.stringify(sessionData.activeBlockers, null, 2) + '\n\n';
    }

    return context;
  }

  /**
   * Get handoff context enriched with extracted artifacts from analysis
   */
  async getHandoffContextWithExtracted(
    projectId: string,
    gateType: string,
    gateContext: GateContext,
  ): Promise<string> {
    const baseContext = await this.getHandoffContext(projectId, gateType);

    // Add extracted artifacts to context
    let enrichedContext = baseContext;

    if (gateContext.extractedArtifacts.openApiSpec) {
      enrichedContext += `\n\n## Extracted OpenAPI Specification\nAn OpenAPI spec was extracted from the uploaded code:\n\`\`\`json\n${JSON.stringify(gateContext.extractedArtifacts.openApiSpec, null, 2).slice(0, 5000)}\n\`\`\``;
    }

    if (gateContext.extractedArtifacts.prismaSchema) {
      enrichedContext += `\n\n## Extracted Database Schema\nA Prisma schema was extracted/converted from the uploaded code:\n\`\`\`prisma\n${gateContext.extractedArtifacts.prismaSchema.slice(0, 3000)}\n\`\`\``;
    }

    if (gateContext.extractedArtifacts.uiRequirements?.length) {
      const endpoints = gateContext.extractedArtifacts.uiRequirements
        .map((e) => `- ${e.method} ${e.path}`)
        .join('\n');
      enrichedContext += `\n\n## UI API Requirements\nThe following API endpoints are called by the uploaded UI code:\n${endpoints}`;
    }

    if (gateContext.extractedArtifacts.securityIssues?.length) {
      const issues = gateContext.extractedArtifacts.securityIssues
        .map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`)
        .join('\n');
      enrichedContext += `\n\n## Security Issues Detected\nThe following security issues were found in the uploaded code:\n${issues}`;
    }

    enrichedContext += `\n\n## Project Classification\n- Completeness: ${gateContext.classification.completeness}`;
    if (gateContext.classification.uiFramework) {
      enrichedContext += `\n- UI Framework: ${gateContext.classification.uiFramework}`;
    }
    if (gateContext.classification.backendFramework) {
      enrichedContext += `\n- Backend Framework: ${gateContext.classification.backendFramework}`;
    }
    if (gateContext.classification.orm) {
      enrichedContext += `\n- ORM: ${gateContext.classification.orm}`;
    }

    return enrichedContext;
  }

  /**
   * Prioritize documents based on relevance to current gate
   */
  prioritizeDocumentsForGate(
    documents: { title: string; content: string; documentType: string }[],
    gateType: string,
  ): { title: string; content: string; documentType: string }[] {
    // Define which document types are most relevant for each gate
    const priorities: Record<string, string[]> = {
      G2_PENDING: ['REQUIREMENTS'], // PM needs intake
      G3_PENDING: ['REQUIREMENTS'], // Architect needs PRD
      G4_PENDING: ['ARCHITECTURE', 'REQUIREMENTS'], // Designer needs arch + PRD
      G5_PENDING: ['REQUIREMENTS', 'ARCHITECTURE', 'API_SPEC', 'DATABASE_SCHEMA', 'DESIGN'], // Devs need PRD + specs
      G6_PENDING: ['CODE', 'API_SPEC', 'REQUIREMENTS'], // QA needs code + specs
      G7_PENDING: ['CODE', 'ARCHITECTURE'], // Security needs code + arch
      G8_PENDING: ['DEPLOYMENT_GUIDE', 'ARCHITECTURE'], // DevOps needs deploy guide
      G9_PENDING: ['DEPLOYMENT_GUIDE', 'TEST_RESULTS'], // Production deployment
    };

    const priorityTypes = priorities[gateType] || [];

    return [...documents].sort((a, b) => {
      const aIndex = priorityTypes.indexOf(a.documentType);
      const bIndex = priorityTypes.indexOf(b.documentType);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  /**
   * Build prompt for validation mode
   */
  buildValidationPrompt(
    taskDescription: string,
    handoffContext: string,
    gateContext: GateContext,
  ): string {
    return `## VALIDATION MODE

You are reviewing EXISTING artifacts, NOT creating new ones.

**Your Task:** ${taskDescription}

**Mode:** VALIDATION - The user has uploaded code/documents that already address this gate's requirements. Your job is to:
1. Review the existing artifacts for completeness
2. Verify they meet quality standards
3. Identify any minor gaps or issues
4. Provide a brief validation report

DO NOT regenerate or significantly rewrite existing content. Only make minimal corrections if absolutely necessary.

**Context from Analysis:**
${handoffContext}

**Focus Areas from User:**
${gateContext.routing.focusAreas.join(', ') || 'None specified'}

Please provide your validation assessment.`;
  }

  /**
   * Build prompt for delta mode
   */
  buildDeltaPrompt(
    taskDescription: string,
    handoffContext: string,
    gateContext: GateContext,
  ): string {
    return `## DELTA MODE

You are filling in gaps in EXISTING artifacts, NOT creating from scratch.

**Your Task:** ${taskDescription}

**Mode:** DELTA - The user has uploaded partial code/documents. Your job is to:
1. Review what already exists in the context
2. Identify what's missing or incomplete
3. Generate ONLY the missing pieces
4. Ensure consistency with existing artifacts

DO NOT regenerate content that already exists. Focus only on gaps.

**Context from Analysis:**
${handoffContext}

**Focus Areas from User:**
${gateContext.routing.focusAreas.join(', ') || 'None specified'}

Please generate only the missing components.`;
  }

  /**
   * Strip internal reasoning and tool calls from agent output before saving
   */
  cleanAgentOutput(content: string): string {
    return (
      content
        // Remove <thinking> tags and their content
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        // Remove MCP/tool call XML tags
        .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi, '')
        .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '')
        // Remove standalone tool tags on their own lines
        .replace(/^.*<invoke[^>]*>.*$/gm, '')
        .replace(/^.*<parameter[^>]*>.*$/gm, '')
        // Remove other common internal tool tags
        .replace(/<get_documents>[\s\S]*?<\/get_documents>/gi, '')
        .replace(/<get_context_for_story>[\s\S]*?<\/get_context_for_story>/gi, '')
        // Clean up excessive whitespace left behind
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  /**
   * Create deliverables for an agent at a specific gate
   * This ensures deliverables exist before the agent starts
   */
  async createAgentDeliverables(
    projectId: string,
    projectType: string | null,
    agentType: string,
    gateType: string,
  ): Promise<void> {
    const deliverables = getDeliverablesForGate(projectType, gateType);

    // Filter to only deliverables owned by this agent
    const agentDeliverables = deliverables.filter((d) => d.owner === agentType);

    if (agentDeliverables.length === 0) {
      console.log(`[GateAgentExecutor] No deliverables configured for ${agentType} at ${gateType}`);
      return;
    }

    // Create deliverables that don't already exist
    for (const deliverable of agentDeliverables) {
      const existing = await this.prisma.deliverable.findFirst({
        where: {
          projectId,
          name: deliverable.name,
          owner: agentType,
        },
      });

      if (!existing) {
        await this.prisma.deliverable.create({
          data: {
            projectId,
            name: deliverable.name,
            owner: agentType,
            path: deliverable.path,
            status: 'in_progress',
          },
        });
        console.log(
          `[GateAgentExecutor] Created deliverable: ${deliverable.name} for ${agentType}`,
        );
      } else {
        // Reset to in_progress if re-running
        if (existing.status !== 'in_progress') {
          await this.prisma.deliverable.update({
            where: { id: existing.id },
            data: { status: 'in_progress' },
          });
        }
      }
    }

    console.log(
      `[GateAgentExecutor] Ensured ${agentDeliverables.length} deliverable(s) exist for ${agentType} at ${gateType}`,
    );
  }

  /**
   * Mark deliverables complete for an agent
   */
  async markAgentDeliverablesComplete(projectId: string, agentType: string): Promise<void> {
    const result = await this.prisma.deliverable.updateMany({
      where: {
        projectId,
        owner: agentType,
        status: { not: 'complete' },
      },
      data: {
        status: 'complete',
      },
    });

    if (result.count > 0) {
      console.log(
        `[GateAgentExecutor] Marked ${result.count} deliverable(s) complete for ${agentType}`,
      );

      // Log event
      await this.eventStore.appendEvent(projectId, {
        type: 'DeliverablesCompleted',
        data: { agentType, count: result.count },
      });
    }
  }
}
