import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { AgentExecutionService } from './agent-execution.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { GateDocumentsService } from '../../documents/services/gate-documents.service';
import { EventStoreService } from '../../events/event-store.service';
import { SessionContextService } from '../../session-context/session-context.service';
import { GitIntegrationService } from '../../code-generation/git-integration.service';
import { GateAgentExecutorService } from './gate-agent-executor.service';
import { ChatMessageService } from './chat-message.service';
import { FeedbackService } from './feedback.service';
import { getAgentsForGate, getAgentTaskDescription, isParallelGate } from '../../gates/gate-config';
import { GateContext, GateAction } from '../../universal-input/dto/gate-recommendation.dto';

/**
 * GateOrchestrationService handles gate-level orchestration including:
 * - Gate transitions and approval flow
 * - Agent execution for gates (parallel/sequential)
 * - Universal Input Handler support
 * - Git checkpoints
 *
 * Extracted from WorkflowCoordinatorService for better separation of concerns.
 */
@Injectable()
export class GateOrchestrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly agentExecution: AgentExecutionService,
    private readonly gateStateMachine: GateStateMachineService,
    @Inject(forwardRef(() => AppWebSocketGateway))
    private readonly wsGateway: AppWebSocketGateway,
    private readonly gateDocuments: GateDocumentsService,
    private readonly eventStore: EventStoreService,
    private readonly sessionContext: SessionContextService,
    private readonly gitIntegration: GitIntegrationService,
    private readonly gateAgentExecutor: GateAgentExecutorService,
    @Inject(forwardRef(() => ChatMessageService))
    private readonly chatMessageService: ChatMessageService,
    @Inject(forwardRef(() => FeedbackService))
    private readonly feedbackService: FeedbackService,
  ) {}

  // ============================================================
  // TASK EXECUTION
  // ============================================================

  /**
   * Execute next task in workflow
   * Automatically triggered after agent completion or gate approval
   */
  async executeNextTask(
    projectId: string,
    userId: string,
  ): Promise<{
    started: boolean;
    taskId?: string;
    agentType?: string;
    reason?: string;
  }> {
    // FIRST: Check if we're waiting for gate approval - don't execute anything
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);
    if (currentGate && currentGate.status === 'IN_REVIEW') {
      console.log(`Blocking task execution - gate ${currentGate.gateType} is IN_REVIEW`);
      return {
        started: false,
        reason: `Waiting for gate approval: ${currentGate.gateType}`,
      };
    }

    // Get next executable task
    const nextTask = await this.orchestrator.getNextExecutableTask(projectId);

    if (!nextTask) {
      return {
        started: false,
        reason: 'No executable tasks available',
      };
    }

    // Mark task as in_progress
    await this.prisma.task.update({
      where: { id: nextTask.id },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    });

    // Execute the agent
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: nextTask.owner,
        userPrompt: nextTask.description || nextTask.name,
        model: undefined,
      },
      userId,
      {
        onChunk: (chunk: string) => {
          this.wsGateway.emitAgentChunk(projectId, agentExecutionId, chunk);
        },
        onComplete: async (response) => {
          this.wsGateway.emitAgentCompleted(projectId, agentExecutionId, {
            content: response.content,
            usage: response.usage,
            finishReason: response.finishReason,
          });

          // Agent completed - check if gate is ready
          await this.checkGateReadiness(projectId, userId);

          // Try to execute next task automatically
          setTimeout(async () => {
            try {
              await this.executeNextTask(projectId, userId);
            } catch (error) {
              console.error('Auto-execution error:', error);
            }
          }, 1000);
        },
        onError: (error) => {
          console.error('Agent execution error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    // Emit agent started via WebSocket
    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      nextTask.owner,
      nextTask.description || nextTask.name,
    );

    return {
      started: true,
      taskId: nextTask.id,
      agentType: nextTask.owner,
    };
  }

  /**
   * Check if current gate is ready for user approval
   */
  private async checkGateReadiness(projectId: string, _userId: string): Promise<void> {
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    if (!currentGate || currentGate.status !== 'PENDING') {
      return;
    }

    // Check if all required tasks for this gate are complete
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        state: true,
        tasks: {
          where: {
            phase: this.getPhaseForGate(currentGate.gateType),
          },
        },
      },
    });

    if (!project) {
      return;
    }

    const tasks = project.tasks || [];
    const allTasksComplete = tasks.every((t) => t.status === 'complete');

    if (allTasksComplete && tasks.length > 0) {
      // Transition gate to IN_REVIEW
      await this.gateStateMachine.transitionToReview(projectId, currentGate.gateType, {
        description: `Gate ${currentGate.gateType} is ready for approval`,
        passingCriteria: currentGate.passingCriteria,
      });
    }
  }

  // ============================================================
  // GATE APPROVAL FLOW
  // ============================================================

  /**
   * Handle gate approval - triggers next phase and creates post-gate documents.
   *
   * Per the framework:
   * - G1 creates: FEEDBACK_LOG.md, COST_LOG.md, PROJECT_CONTEXT.md
   * - G2 creates: CHANGE_REQUESTS.md
   * - G9 creates: POST_LAUNCH.md
   */
  async onGateApproved(
    projectId: string,
    gateType: string,
    userId: string,
    callbacks?: {
      startProductManagerAgent?: (projectId: string, userId: string) => Promise<string>;
    },
  ): Promise<void> {
    // Gate was approved, update project phase
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    if (!project || !project.state) {
      return;
    }

    // Create git checkpoint commit for this gate approval
    await this.createGitCheckpoint(projectId, gateType, userId);

    // Update phase based on gate
    const nextPhase = this.getNextPhaseForGate(gateType);
    if (nextPhase) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          state: {
            update: {
              currentPhase: nextPhase as any,
            },
          },
        },
      });
    }

    // ============================================================
    // G1 Approval: Decompose requirements and create post-gate documents
    // ============================================================
    try {
      if (gateType === 'G1_PENDING' || gateType === 'G1_COMPLETE') {
        console.log('G1 approved - processing post-approval tasks for project:', projectId);

        // Check if tasks already exist
        const existingTasks = await this.prisma.task.count({
          where: {
            projectId,
            owner: 'PRODUCT_MANAGER',
          },
        });

        if (existingTasks === 0) {
          console.log('Decomposing requirements and creating tasks for all agents');

          const intakeDocument = await this.prisma.document.findFirst({
            where: { projectId, title: 'Project Intake' },
          });

          if (intakeDocument) {
            const requirements =
              intakeDocument.content || 'Build the project as specified in the intake document';

            const decomposition = await this.orchestrator.decomposeRequirements(
              projectId,
              requirements,
            );
            console.log('Created decomposition with', decomposition.tasks.length, 'tasks');

            await this.orchestrator.createTasksFromDecomposition(projectId, userId, decomposition);
            console.log('Tasks created in database');
          }
        } else {
          console.log('Tasks already exist, skipping decomposition');
        }

        // Create post-G1 documents
        console.log('Creating post-G1 documents for project:', projectId);
        const createdDocs = await this.gateDocuments.initializeGateDocuments(
          projectId,
          'G1',
          userId,
          { projectName: project.name },
        );

        if (createdDocs.length > 0) {
          console.log('Created post-G1 documents:', createdDocs);

          const documents = await this.prisma.document.findMany({
            where: {
              projectId,
              title: { in: createdDocs },
            },
            select: { id: true, title: true, documentType: true },
          });

          for (const doc of documents) {
            this.wsGateway.emitDocumentCreated(projectId, {
              id: doc.id,
              title: doc.title,
              documentType: doc.documentType,
            });
          }
        }

        // Auto-start PRD creation after G1 approval
        const existingPRD = await this.prisma.document.findFirst({
          where: {
            projectId,
            title: 'Product Requirements Document',
          },
        });

        if (!existingPRD && callbacks?.startProductManagerAgent) {
          console.log('Auto-starting PRD creation after G1 approval');

          await this.gateStateMachine.ensureGateExists(projectId, 'G2_PENDING');
          await this.prisma.project.update({
            where: { id: projectId },
            data: {
              state: {
                update: {
                  currentGate: 'G2_PENDING',
                },
              },
            },
          });
          console.log('Created G2_PENDING gate and updated ProjectState');

          const placeholderAgentId = `prd-starting-${Date.now()}`;
          this.wsGateway.emitAgentStarted(
            projectId,
            placeholderAgentId,
            'PRODUCT_MANAGER',
            'Creating Product Requirements Document',
          );

          setTimeout(() => {
            callbacks.startProductManagerAgent!(projectId, userId).catch((error) => {
              console.error('Failed to auto-start PRD creation:', error);
              this.wsGateway.emitAgentFailed(projectId, placeholderAgentId, error.message);
            });
          }, 500);
        } else if (!existingPRD) {
          console.log('PRD auto-start skipped - no callback provided');
        } else {
          console.log('PRD already exists, skipping auto-creation');
        }
      } else if (gateType === 'G2_PENDING') {
        console.log('G2 approved - creating post-G2 documents and starting G3 agents');

        await this.gateDocuments.initializeGateDocuments(projectId, 'G2', userId, {
          projectName: project.name,
        });

        await this.executeGateAgents(projectId, 'G3_PENDING', userId);
      } else if (gateType === 'G3_PENDING') {
        console.log('G3 approved - starting G4 (Design) agents');
        await this.executeGateAgents(projectId, 'G4_PENDING', userId);
      } else if (gateType === 'G4_PENDING') {
        console.log('G4 approved - starting G5 (Development) agents in PARALLEL');

        // Create explicit handoff record from G4 (Design) to G5 (Development)
        const designDocs = await this.prisma.document.findMany({
          where: {
            projectId,
            documentType: { in: ['DESIGN', 'ARCHITECTURE'] },
          },
          select: { title: true },
        });

        await this.prisma.handoff.create({
          data: {
            projectId,
            fromAgent: 'UX_UI_DESIGNER',
            toAgent: 'FRONTEND_DEVELOPER,BACKEND_DEVELOPER',
            phase: 'development',
            status: 'complete',
            notes: `G4→G5 Transition: Design phase complete. Handing off to parallel development.\n\nDesign documents provided:\n${designDocs.map((d) => `- ${d.title}`).join('\n')}`,
          },
        });

        await this.executeGateAgents(projectId, 'G5_PENDING', userId);
      } else if (gateType === 'G5_PENDING') {
        console.log('G5 approved - starting G6 (Testing) agents');
        await this.executeGateAgents(projectId, 'G6_PENDING', userId);
      } else if (gateType === 'G6_PENDING') {
        console.log('G6 approved - starting G7 (Security) agents');
        await this.executeGateAgents(projectId, 'G7_PENDING', userId);
      } else if (gateType === 'G7_PENDING') {
        console.log('G7 approved - starting G8 (Staging) agents');
        await this.executeGateAgents(projectId, 'G8_PENDING', userId);
      } else if (gateType === 'G8_PENDING') {
        console.log('G8 approved - starting G9 (Production) agents');
        await this.executeGateAgents(projectId, 'G9_PENDING', userId);
      } else if (gateType === 'G9_PENDING') {
        console.log('🎉 PROJECT COMPLETE:', projectId);

        await this.gateDocuments.initializeGateDocuments(projectId, 'G9', userId, {
          projectName: project.name,
        });

        await this.eventStore.appendEvent(projectId, {
          type: 'ProjectCompleted',
          data: { projectId, projectName: project.name },
          userId,
        });
      }
    } catch (error) {
      console.error('Error in post-gate processing:', error);
    }

    // Try to execute next task
    await this.executeNextTask(projectId, userId);
  }

  /**
   * Get project workflow status
   */
  async getWorkflowStatus(
    projectId: string,
    _userId: string,
  ): Promise<{
    currentGate: string;
    currentPhase: string;
    gateStatus: string;
    nextTask: any;
    progress: any;
  }> {
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);
    const nextTask = await this.orchestrator.getNextExecutableTask(projectId);
    const progress = await this.orchestrator.getProjectProgress(projectId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    return {
      currentGate: currentGate?.gateType || 'UNKNOWN',
      currentPhase: project?.state?.currentPhase || 'UNKNOWN',
      gateStatus: currentGate?.status || 'UNKNOWN',
      nextTask,
      progress,
    };
  }

  // ============================================================
  // PARALLEL AGENT EXECUTION (G2-G9 Workflow)
  // ============================================================

  /**
   * Execute agents for a gate - supports parallel execution
   * Called after gate approval to start the next phase's agents
   */
  async executeGateAgents(projectId: string, gateType: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      console.error(`[GateOrchestration] Project not found: ${projectId}`);
      return;
    }

    const projectType = project.type || 'traditional';

    // G5 Readiness Check: Verify G4 (Design) is properly completed before starting development
    if (gateType === 'G5_PENDING') {
      const g4Gate = await this.prisma.gate.findFirst({
        where: { projectId, gateType: 'G4_PENDING' },
        select: { status: true },
      });

      if (!g4Gate || g4Gate.status !== 'APPROVED') {
        console.error(
          `[GateOrchestration] Cannot start G5: G4 (Design) is not approved. Status: ${g4Gate?.status || 'NOT_FOUND'}`,
        );
        this.wsGateway.emitChatMessage(
          projectId,
          `g5-blocked-${Date.now()}`,
          'Cannot start development: Design phase (G4) must be approved first.',
        );
        return;
      }

      // Verify design deliverables exist
      const designDocs = await this.prisma.document.findMany({
        where: {
          projectId,
          documentType: { in: ['DESIGN', 'ARCHITECTURE'] },
        },
        select: { id: true, title: true },
      });

      if (designDocs.length === 0) {
        console.warn(
          `[GateOrchestration] Starting G5 without design documents - agents may lack design context`,
        );
      } else {
        console.log(
          `[GateOrchestration] G5 readiness check passed. Design documents available: ${designDocs.map((d) => d.title).join(', ')}`,
        );
      }
    }

    // Ensure gate exists before executing agents
    const existingGate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!existingGate) {
      console.log(`[GateOrchestration] Gate ${gateType} doesn't exist, creating it`);
      await this.gateStateMachine.ensureGateExists(projectId, gateType);
    }

    // Update ProjectState.currentGate to this gate
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        state: {
          update: {
            currentGate: gateType,
          },
        },
      },
    });
    console.log(`[GateOrchestration] Updated ProjectState.currentGate to ${gateType}`);

    // Get agents for this gate based on project type
    const agents = getAgentsForGate(projectType, gateType);

    if (agents.length === 0) {
      console.log(`[GateOrchestration] No agents configured for gate ${gateType}`);
      return;
    }

    console.log(
      `[GateOrchestration] Executing ${agents.length} agent(s) for gate ${gateType}:`,
      agents.join(', '),
    );

    // Log event for parallel execution start
    await this.eventStore.appendEvent(projectId, {
      type: 'ParallelAgentsStarted',
      data: {
        gateType,
        agents,
        count: agents.length,
        projectType,
      },
      userId,
    });

    // Check if this is parallel execution
    const isParallel = isParallelGate(projectType, gateType);

    if (isParallel) {
      console.log(`[GateOrchestration] Starting PARALLEL execution of ${agents.length} agents`);

      // For parallel execution, each agent gets their own context with their specific tasks
      const agentPromises = agents.map(async (agentType) => {
        const handoffContext = await this.gateAgentExecutor.getHandoffContext(
          projectId,
          gateType,
          agentType,
        );
        return this.gateAgentExecutor.executeSingleAgent(
          projectId,
          agentType,
          gateType,
          userId,
          handoffContext,
          {
            onRetry: async (pId, aType, gType, uId, _context) => {
              // Get fresh context on retry
              const freshContext = await this.gateAgentExecutor.getHandoffContext(
                pId,
                gType,
                aType,
              );
              return this.gateAgentExecutor.executeSingleAgent(
                pId,
                aType,
                gType,
                uId,
                freshContext,
              );
            },
            getRetryCount: (pId, aType, gType) => this.getAgentRetryCount(pId, aType, gType),
            markDeliverablesComplete: (pId, aType) =>
              this.gateAgentExecutor.markAgentDeliverablesComplete(pId, aType),
          },
        );
      });

      await Promise.all(agentPromises);
    } else {
      // Sequential execution (single agent)
      for (const agentType of agents) {
        const handoffContext = await this.gateAgentExecutor.getHandoffContext(
          projectId,
          gateType,
          agentType,
        );
        await this.gateAgentExecutor.executeSingleAgent(
          projectId,
          agentType,
          gateType,
          userId,
          handoffContext,
          {
            onRetry: async (pId, aType, gType, uId, _context) => {
              const freshContext = await this.gateAgentExecutor.getHandoffContext(
                pId,
                gType,
                aType,
              );
              return this.gateAgentExecutor.executeSingleAgent(
                pId,
                aType,
                gType,
                uId,
                freshContext,
              );
            },
            getRetryCount: (pId, aType, gType) => this.getAgentRetryCount(pId, aType, gType),
            markDeliverablesComplete: (pId, aType) =>
              this.gateAgentExecutor.markAgentDeliverablesComplete(pId, aType),
          },
        );
      }
    }

    // After all agents complete, check if gate can transition
    await this.checkAndTransitionGate(projectId, gateType, userId);
  }

  /**
   * Retry failed agents for a gate
   */
  async retryGateAgents(projectId: string, gateType: string, userId: string): Promise<void> {
    console.log(`[GateOrchestration] Retrying agents for gate ${gateType} on project ${projectId}`);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new Error('Access denied');
    }

    await this.executeGateAgents(projectId, gateType, userId);
  }

  /**
   * Check if all deliverables are complete and transition gate to review
   */
  async checkAndTransitionGate(projectId: string, gateType: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { type: true },
    });
    const projectType = project?.type || 'traditional';
    const gateAgents = getAgentsForGate(projectType, gateType);

    const deliverables = await this.prisma.deliverable.findMany({
      where: {
        projectId,
        ...(gateAgents.length > 0 ? { owner: { in: gateAgents } } : {}),
      },
    });

    // If no deliverables found for this gate's agents, check for documents instead
    let hasDocuments = false;
    if (deliverables.length === 0) {
      console.log(
        `[GateOrchestration] Gate ${gateType}: No deliverables found for agents ${gateAgents.join(', ')}, checking for documents`,
      );

      // Use actual DocumentType enum values from Prisma schema
      const gateDocTypes: Record<string, string> = {
        G2_PENDING: 'REQUIREMENTS',
        G3_PENDING: 'ARCHITECTURE',
        G4_PENDING: 'DESIGN',
        G5_PENDING: 'CODE',
        G6_PENDING: 'TEST_PLAN',
        G7_PENDING: 'OTHER', // Security audits stored as OTHER
        G8_PENDING: 'DEPLOYMENT_GUIDE',
        G9_PENDING: 'DEPLOYMENT_GUIDE',
      };

      const expectedType = gateDocTypes[gateType];
      if (expectedType) {
        const docs = await this.prisma.document.findMany({
          where: {
            projectId,
            documentType: expectedType as any,
          },
        });

        if (docs.length > 0) {
          console.log(
            `[GateOrchestration] Gate ${gateType}: Found ${docs.length} ${expectedType} document(s), transitioning to review`,
          );
          hasDocuments = true;
        } else {
          console.log(`[GateOrchestration] Gate ${gateType}: No documents found, waiting...`);
          return;
        }
      }
    }

    const incompleteCount = deliverables.filter((d) => d.status !== 'complete').length;
    const totalCount = deliverables.length;

    console.log(
      `[GateOrchestration] Gate ${gateType}: ${totalCount - incompleteCount}/${totalCount} deliverables complete for agents ${gateAgents.join(', ')}`,
    );

    if ((incompleteCount === 0 && totalCount > 0) || hasDocuments) {
      // For G5 (Development), verify proof artifacts show PASSING builds for BOTH agents
      // AND that the preview server successfully starts
      if (gateType === 'G5_PENDING') {
        const requiredProofs = ['build_output', 'lint_output'];
        const requiredAgents = ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER'];

        const proofs = await this.prisma.proofArtifact.findMany({
          where: {
            projectId,
            gate: 'G5_PENDING',
            proofType: { in: [...requiredProofs, 'preview_startup'] as any },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Validate that BOTH agents (frontend AND backend) have passing proofs
        // Just counting total proofs isn't enough - need to verify by agent type
        const agentProofStatus: Record<string, { build: boolean; lint: boolean }> = {};

        for (const agent of requiredAgents) {
          const agentBuildProof = proofs.find(
            (p) => p.proofType === 'build_output' && p.createdBy === agent && p.passFail === 'pass',
          );
          const agentLintProof = proofs.find(
            (p) => p.proofType === 'lint_output' && p.createdBy === agent && p.passFail === 'pass',
          );

          agentProofStatus[agent] = {
            build: !!agentBuildProof,
            lint: !!agentLintProof,
          };
        }

        const frontendPassed =
          agentProofStatus['FRONTEND_DEVELOPER']?.build &&
          agentProofStatus['FRONTEND_DEVELOPER']?.lint;
        const backendPassed =
          agentProofStatus['BACKEND_DEVELOPER']?.build &&
          agentProofStatus['BACKEND_DEVELOPER']?.lint;

        // Check for preview_startup proof - this validates the app actually runs in the browser
        const previewProof = proofs.find(
          (p) => p.proofType === 'preview_startup' && p.passFail === 'pass',
        );

        if (!frontendPassed || !backendPassed || !previewProof) {
          const missingParts: string[] = [];
          if (!agentProofStatus['FRONTEND_DEVELOPER']?.build) missingParts.push('Frontend build');
          if (!agentProofStatus['FRONTEND_DEVELOPER']?.lint) missingParts.push('Frontend lint');
          if (!agentProofStatus['BACKEND_DEVELOPER']?.build) missingParts.push('Backend build');
          if (!agentProofStatus['BACKEND_DEVELOPER']?.lint) missingParts.push('Backend lint');
          if (!previewProof)
            missingParts.push('Preview server startup (app must be viewable in browser)');

          console.log(
            `[GateOrchestration] G5 not ready: missing passing proofs for: ${missingParts.join(', ')}`,
          );

          // Check for failing proofs to provide feedback
          const failingProofs = proofs.filter((p) => p.passFail === 'fail');
          if (failingProofs.length > 0) {
            const failureMessage =
              `Build validation failed. Issues found:\n` +
              failingProofs
                .map((p) => `- ${p.createdBy} ${p.proofType}: ${p.contentSummary}`)
                .join('\n');
            this.wsGateway.emitChatMessage(
              projectId,
              `g5-validation-${Date.now()}`,
              failureMessage,
            );
          }

          // AUTO-FIX: Trigger automatic error fixing if preview or build failed
          // This is the key integration point for the self-healing feedback loop
          if (!previewProof || failingProofs.length > 0) {
            console.log(
              `[GateOrchestration] G5 validation failed - triggering auto-fix for project ${projectId}`,
            );

            // Use feedbackService to check for errors and auto-fix them
            try {
              const autoFixResult = await this.feedbackService.checkAndFixPreviewErrors(
                projectId,
                userId,
                (pId, gType) => this.gateAgentExecutor.getHandoffContext(pId, gType),
              );

              if (autoFixResult.triggered) {
                console.log(
                  `[GateOrchestration] Auto-fix triggered for ${autoFixResult.errors?.length || 0} errors`,
                );
                // Don't return here - let the gate check run again after fix completes
                // The agent's onComplete callback will re-trigger checkAndTransitionGate
              } else {
                // No errors detected by feedbackService, show the manual message
                this.wsGateway.emitChatMessage(
                  projectId,
                  `g5-preview-${Date.now()}`,
                  'The application must be viewable in the preview window before G5 can be marked ready. Please ensure the frontend code is generated and the preview server starts successfully.',
                );
              }
            } catch (autoFixError) {
              console.error(`[GateOrchestration] Auto-fix failed:`, autoFixError);
              // Fall back to showing manual message
              this.wsGateway.emitChatMessage(
                projectId,
                `g5-preview-${Date.now()}`,
                'The application must be viewable in the preview window before G5 can be marked ready. Please ensure the frontend code is generated and the preview server starts successfully.',
              );
            }
          }

          return; // Don't transition - all proofs must pass including preview
        }

        console.log(
          `[GateOrchestration] G5 validation passed: both FRONTEND_DEVELOPER and BACKEND_DEVELOPER have passing builds, and preview is working`,
        );
      }

      console.log(
        `[GateOrchestration] All deliverables complete, transitioning ${gateType} to review`,
      );

      await this.gateStateMachine.transitionToReview(projectId, gateType, {
        description: `${gateType} ready for approval - all ${totalCount} deliverables complete`,
      });

      const gate = await this.prisma.gate.findFirst({
        where: { projectId, gateType },
        select: { id: true },
      });

      await this.eventStore.appendEvent(projectId, {
        type: 'GateReadyForReview',
        data: { gateType, gateId: gate?.id, deliverableCount: totalCount },
        userId,
      });

      this.wsGateway.emitGateReady(projectId, gate?.id || '', gateType, [
        {
          type: 'deliverables_complete',
          message: `${gateType} is ready for your review and approval.`,
          count: totalCount,
        },
      ]);

      const gateNumber = this.extractGateNumber(gateType);
      await this.chatMessageService.generateOrchestratorMessage(projectId, userId, 'gate_ready', {
        gateNumber,
        gateType,
      });
    }
  }

  /**
   * Check if a gate is stuck (has failed agents) and retry if so
   */
  async checkAndRetryStuckGate(projectId: string, userId: string): Promise<string | null> {
    const pendingGates = await this.prisma.gate.findMany({
      where: {
        projectId,
        status: 'PENDING',
        gateType: { endsWith: '_PENDING' },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const gate of pendingGates) {
      const [failedAgents, runningAgents] = await Promise.all([
        this.prisma.agent.findMany({
          where: {
            projectId,
            status: 'FAILED',
            contextData: {
              path: ['currentGate'],
              equals: gate.gateType,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        }),
        this.prisma.agent.findFirst({
          where: {
            projectId,
            status: 'RUNNING',
          },
        }),
      ]);

      if (failedAgents.length > 0 && !runningAgents) {
        console.log(
          `[GateOrchestration] Gate ${gate.gateType} is stuck with failed agents, auto-retrying`,
        );

        const messageId = `retry-${gate.gateType}-${Date.now()}`;
        this.wsGateway.emitChatMessage(
          projectId,
          messageId,
          `I noticed the previous attempt failed. Let me retry the ${gate.gateType.replace('_PENDING', '')} work...`,
        );

        this.executeGateAgents(projectId, gate.gateType, userId).catch((error) => {
          console.error(`[GateOrchestration] Retry failed for ${gate.gateType}:`, error);
        });

        return gate.gateType;
      }
    }

    return null;
  }

  /**
   * Get retry count for an agent at a specific gate
   */
  async getAgentRetryCount(
    projectId: string,
    agentType: string,
    gateType: string,
  ): Promise<number> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const failedCount = await this.prisma.agent.count({
      where: {
        projectId,
        agentType,
        status: 'FAILED',
        createdAt: { gte: tenMinutesAgo },
        contextData: {
          path: ['currentGate'],
          equals: gateType,
        },
      },
    });
    return failedCount;
  }

  // ============================================================
  // GIT CHECKPOINTS
  // ============================================================

  /**
   * Create a git checkpoint commit after gate approval
   */
  private async createGitCheckpoint(
    projectId: string,
    gateType: string,
    userId: string,
  ): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });

      if (!project) {
        console.log(`[GitCheckpoint] Project not found: ${projectId}`);
        return;
      }

      const uncommittedFiles = await this.gitIntegration.getUncommittedFiles(projectId);

      if (uncommittedFiles.length === 0) {
        console.log(`[GitCheckpoint] No uncommitted files for ${gateType}`);
        return;
      }

      console.log(
        `[GitCheckpoint] Creating checkpoint for ${gateType} with ${uncommittedFiles.length} files`,
      );

      const gateNumber = this.extractGateNumber(gateType);
      const commitMessage = `Gate ${gateType} approved - Checkpoint commit

Project: ${project.name}
Gate: G${gateNumber} (${this.getGateName(gateNumber)})
Files: ${uncommittedFiles.length} files committed
Approved by: User

This is an automatic checkpoint commit created after gate approval.`;

      const commitResult = await this.gitIntegration.commitAll(projectId, commitMessage, {
        name: 'FuzzyLlama System',
        email: 'system@fuzzyllama.ai',
      });

      if (commitResult.success) {
        console.log(`[GitCheckpoint] Checkpoint created: ${commitResult.commitHash}`);

        await this.eventStore.appendEvent(projectId, {
          type: 'GitCheckpointCreated',
          data: {
            gateType,
            commitHash: commitResult.commitHash,
            filesCommitted: uncommittedFiles.length,
            message: commitMessage,
          },
          userId,
        });

        const checkpointMessage = `**Git Checkpoint Created**\nCommit: \`${commitResult.commitHash?.substring(0, 8)}\`\nFiles: ${uncommittedFiles.length} committed`;
        this.wsGateway.emitAgentChunk(projectId, `git-checkpoint-${gateType}`, checkpointMessage);
        this.wsGateway.emitAgentCompleted(projectId, `git-checkpoint-${gateType}`, {
          content: checkpointMessage,
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'end_turn',
        });
      } else {
        console.error(`[GitCheckpoint] Failed to create checkpoint: ${commitResult.error}`);

        await this.eventStore.appendEvent(projectId, {
          type: 'GitCheckpointFailed',
          data: {
            gateType,
            error: commitResult.error,
          },
          userId,
        });
      }
    } catch (error) {
      console.error(`[GitCheckpoint] Error creating checkpoint for ${gateType}:`, error);

      await this.eventStore.appendEvent(projectId, {
        type: 'GitCheckpointFailed',
        data: {
          gateType,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        userId,
      });
    }
  }

  // ============================================================
  // UNIVERSAL INPUT HANDLER SUPPORT
  // ============================================================

  /**
   * Start a project workflow with GateContext from Universal Input Handler
   */
  async startWorkflowWithContext(
    projectId: string,
    userId: string,
    gateContext: GateContext,
  ): Promise<{
    projectId: string;
    currentGate: string;
    message: string;
  }> {
    console.log(`[GateOrchestration] Starting workflow with GateContext for project ${projectId}`);
    console.log(`[GateOrchestration] Gate routing:`, gateContext.routing);

    // Store gate context in session
    await this.sessionContext.saveContext({
      projectId,
      sessionId: projectId,
      key: 'gate_context',
      contextType: 'working_set',
      contextData: gateContext,
      ttlSeconds: 86400,
    });

    // Initialize project gates
    await this.orchestrator.initializeProject(projectId, userId);

    // G1 is always skipped when using GateContext
    await this.gateStateMachine.transitionToReview(projectId, 'G1_PENDING', {
      description: 'Scope defined by file analysis',
    });
    await this.gateStateMachine.approveGate(
      projectId,
      'G1_PENDING',
      userId,
      'auto-approved',
      'Scope defined by Universal Input Handler analysis',
    );

    await this.eventStore.appendEvent(projectId, {
      type: 'WorkflowStartedWithContext',
      data: {
        classification: gateContext.classification,
        skipGates: gateContext.routing.skipGates,
        deltaGates: gateContext.routing.deltaGates,
        focusAreas: gateContext.routing.focusAreas,
      },
      userId,
    });

    await this.emitAssumptionsFromContext(projectId, gateContext);

    const firstGate = await this.getNextGateWithContext(
      projectId,
      'G1_PENDING',
      gateContext,
      userId,
    );

    if (firstGate) {
      await this.executeGateWithContext(projectId, firstGate, userId, gateContext);
    }

    return {
      projectId,
      currentGate: firstGate || 'G2_PENDING',
      message: `Workflow started with pre-analyzed context. ${gateContext.routing.skipGates.length} gates will be skipped.`,
    };
  }

  /**
   * Execute a gate with context-aware behavior
   */
  async executeGateWithContext(
    projectId: string,
    gateType: string,
    userId: string,
    gateContext: GateContext,
  ): Promise<void> {
    const gateKey = gateType.replace('_PENDING', '');
    const decision = gateContext.decisions[gateKey];
    const action: GateAction = decision?.action || 'full';

    console.log(`[GateOrchestration] Executing gate ${gateKey} with action: ${action}`);

    switch (action) {
      case 'skip':
        await this.autoSkipGate(projectId, gateType, userId, gateContext);
        break;

      case 'validate':
        await this.executeGateInValidationMode(projectId, gateType, userId, gateContext);
        break;

      case 'delta':
        await this.executeGateInDeltaMode(projectId, gateType, userId, gateContext);
        break;

      case 'full':
      default:
        await this.executeGateAgents(projectId, gateType, userId);
        break;
    }
  }

  /**
   * Execute gate in validation mode - agents review existing artifacts without regenerating
   */
  private async executeGateInValidationMode(
    projectId: string,
    gateType: string,
    userId: string,
    gateContext: GateContext,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    const projectType = project.type || 'traditional';
    const agents = getAgentsForGate(projectType, gateType);

    if (agents.length === 0) {
      console.log(`[GateOrchestration] No agents for validation mode on ${gateType}`);
      return;
    }

    console.log(`[GateOrchestration] Running ${agents.length} agent(s) in VALIDATION mode`);

    const handoffContext = await this.gateAgentExecutor.getHandoffContextWithExtracted(
      projectId,
      gateType,
      gateContext,
    );

    for (const agentType of agents) {
      const taskDescription = getAgentTaskDescription(agentType, gateType);
      const validationPrompt = this.gateAgentExecutor.buildValidationPrompt(
        taskDescription,
        handoffContext,
        gateContext,
      );

      await this.gateAgentExecutor.executeSingleAgent(
        projectId,
        agentType,
        gateType,
        userId,
        validationPrompt,
        {
          onRetry: (pId, aType, gType, uId, context) =>
            this.gateAgentExecutor.executeSingleAgent(pId, aType, gType, uId, context),
          getRetryCount: (pId, aType, gType) => this.getAgentRetryCount(pId, aType, gType),
          markDeliverablesComplete: (pId, aType) =>
            this.gateAgentExecutor.markAgentDeliverablesComplete(pId, aType),
        },
      );
    }

    await this.checkAndTransitionGate(projectId, gateType, userId);
  }

  /**
   * Execute gate in delta mode - agents fill gaps only
   */
  private async executeGateInDeltaMode(
    projectId: string,
    gateType: string,
    userId: string,
    gateContext: GateContext,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    const projectType = project.type || 'traditional';
    const agents = getAgentsForGate(projectType, gateType);

    if (agents.length === 0) {
      console.log(`[GateOrchestration] No agents for delta mode on ${gateType}`);
      return;
    }

    console.log(`[GateOrchestration] Running ${agents.length} agent(s) in DELTA mode`);

    const handoffContext = await this.gateAgentExecutor.getHandoffContextWithExtracted(
      projectId,
      gateType,
      gateContext,
    );

    for (const agentType of agents) {
      const taskDescription = getAgentTaskDescription(agentType, gateType);
      const deltaPrompt = this.gateAgentExecutor.buildDeltaPrompt(
        taskDescription,
        handoffContext,
        gateContext,
      );

      await this.gateAgentExecutor.executeSingleAgent(
        projectId,
        agentType,
        gateType,
        userId,
        deltaPrompt,
        {
          onRetry: (pId, aType, gType, uId, context) =>
            this.gateAgentExecutor.executeSingleAgent(pId, aType, gType, uId, context),
          getRetryCount: (pId, aType, gType) => this.getAgentRetryCount(pId, aType, gType),
          markDeliverablesComplete: (pId, aType) =>
            this.gateAgentExecutor.markAgentDeliverablesComplete(pId, aType),
        },
      );
    }

    await this.checkAndTransitionGate(projectId, gateType, userId);
  }

  /**
   * Auto-skip a gate (mark as approved without executing agents)
   */
  private async autoSkipGate(
    projectId: string,
    gateType: string,
    userId: string,
    gateContext: GateContext,
  ): Promise<void> {
    const gateKey = gateType.replace('_PENDING', '');

    await this.gateStateMachine.ensureGateExists(projectId, gateType);

    await this.gateStateMachine.transitionToReview(projectId, gateType, {
      description: `Skipped per user decision: ${gateContext.decisions[gateKey]?.reason || 'Artifact already exists'}`,
    });
    await this.gateStateMachine.approveGate(
      projectId,
      gateType,
      userId,
      'skipped',
      `Gate skipped per user decision from Universal Input Handler`,
    );

    await this.eventStore.appendEvent(projectId, {
      type: 'GateSkipped',
      data: {
        gateType,
        reason: gateContext.decisions[gateKey]?.reason,
        action: gateContext.decisions[gateKey]?.action,
      },
      userId,
    });

    this.wsGateway.emitGateApproved(projectId, gateType, gateType, 'system');
  }

  /**
   * Generate and emit assumptions to the chat interface based on GateContext
   */
  private async emitAssumptionsFromContext(
    projectId: string,
    gateContext: GateContext,
  ): Promise<void> {
    const assumptions: string[] = [];

    const { classification } = gateContext;
    if (classification.completeness) {
      const completenessLabels: Record<string, string> = {
        'prompt-only': 'This is a new project starting from scratch',
        'ui-only': 'You have provided frontend/UI code that needs a backend',
        'backend-only': 'You have provided backend code that needs a frontend',
        'full-stack': 'You have provided a full-stack application',
        'contracts-only': 'You have provided API contracts/schemas',
        'docs-only': 'You have provided documentation/requirements',
      };
      const label = completenessLabels[classification.completeness];
      if (label) assumptions.push(label);
    }

    if (classification.uiFramework && classification.uiFramework !== 'unknown') {
      assumptions.push(`Your frontend uses ${classification.uiFramework}`);
    }

    if (classification.backendFramework && classification.backendFramework !== 'unknown') {
      assumptions.push(`Your backend uses ${classification.backendFramework}`);
    }

    if (classification.orm && classification.orm !== 'unknown' && classification.orm !== 'none') {
      assumptions.push(`Your database layer uses ${classification.orm}`);
    }

    const { routing } = gateContext;
    if (routing.skipGates.length > 0) {
      const skippedGateNames = routing.skipGates.map((g) => {
        const names: Record<string, string> = {
          G1: 'Scope Definition',
          G2: 'Product Requirements',
          G3: 'Architecture',
          G4: 'Design',
          G5: 'Development',
          G6: 'QA',
          G7: 'Security',
          G8: 'Pre-Deployment',
          G9: 'Production',
        };
        return names[g] || g;
      });
      assumptions.push(
        `I'll skip these phases since they're already covered: ${skippedGateNames.join(', ')}`,
      );
    }

    if (routing.deltaGates.length > 0) {
      assumptions.push(`I'll only generate what's missing for: ${routing.deltaGates.join(', ')}`);
    }

    if (routing.focusAreas.length > 0) {
      assumptions.push(`Key focus areas identified: ${routing.focusAreas.join(', ')}`);
    }

    if (gateContext.extractedArtifacts?.securityIssues?.length) {
      const count = gateContext.extractedArtifacts.securityIssues.length;
      const critical = gateContext.extractedArtifacts.securityIssues.filter(
        (i) => i.severity === 'critical' || i.severity === 'high',
      ).length;
      if (critical > 0) {
        assumptions.push(
          `I found ${count} security issues (${critical} critical/high priority) that I'll address`,
        );
      } else {
        assumptions.push(`I found ${count} security issues to address`);
      }
    }

    if (assumptions.length > 0) {
      const assumptionsMessage = `Based on my analysis of your uploaded files, here's what I understand:\n\n${assumptions.map((a) => `• ${a}`).join('\n')}\n\nI'll proceed with these assumptions. Let me know if any of these are incorrect and I'll adjust my approach.`;

      this.wsGateway.emitOrchestratorMessage(projectId, assumptionsMessage, 'assumptions');
    }
  }

  /**
   * Get the next gate to execute, respecting skip decisions from GateContext
   */
  private async getNextGateWithContext(
    projectId: string,
    currentGate: string,
    gateContext: GateContext,
    userId: string,
  ): Promise<string | null> {
    const gateOrder = [
      'G1_PENDING',
      'G2_PENDING',
      'G3_PENDING',
      'G4_PENDING',
      'G5_PENDING',
      'G6_PENDING',
      'G7_PENDING',
      'G8_PENDING',
      'G9_PENDING',
    ];

    const currentIndex = gateOrder.indexOf(currentGate);
    if (currentIndex === -1 || currentIndex === gateOrder.length - 1) {
      return null;
    }

    for (let i = currentIndex + 1; i < gateOrder.length; i++) {
      const nextGate = gateOrder[i];
      const gateKey = nextGate.replace('_PENDING', '');

      if (!gateContext.routing.skipGates.includes(gateKey)) {
        return nextGate;
      }

      console.log(`[GateOrchestration] Auto-skipping gate ${gateKey} per user decision`);
      await this.autoSkipGate(projectId, nextGate, userId, gateContext);
    }

    return null;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Map gate type to phase
   */
  getPhaseForGate(gateType: string): string {
    const gateToPhase: Record<string, string> = {
      G1_PENDING: 'intake',
      G1_COMPLETE: 'intake',
      G2_PENDING: 'planning',
      G2_COMPLETE: 'planning_complete',
      G3_PENDING: 'architecture',
      G3_COMPLETE: 'architecture_complete',
      G4_PENDING: 'design',
      G4_COMPLETE: 'design_complete',
      G5_PENDING: 'development',
      G5_COMPLETE: 'development_complete',
      G6_PENDING: 'testing',
      G6_COMPLETE: 'testing_complete',
      G7_PENDING: 'security_review',
      G7_COMPLETE: 'security_complete',
      G8_PENDING: 'pre_deployment',
      G8_COMPLETE: 'pre_deployment',
      G9_PENDING: 'production',
      G9_COMPLETE: 'production',
    };
    return gateToPhase[gateType] || 'pre_startup';
  }

  /**
   * Get next phase after gate approval
   * Accepts both G1_PENDING and G1_COMPLETE formats
   */
  getNextPhaseForGate(gateType: string): string | null {
    const gateNumber = this.extractGateNumber(gateType);
    const nextPhaseMap: Record<number, string> = {
      1: 'planning',
      2: 'architecture',
      3: 'design',
      4: 'development',
      5: 'testing',
      6: 'security_review',
      7: 'pre_deployment',
      8: 'production',
      9: 'completion',
    };
    return nextPhaseMap[gateNumber] || null;
  }

  /**
   * Extract gate number from gate type string (e.g., "G1_PENDING" -> 1)
   */
  extractGateNumber(gateType: string): number {
    const match = gateType.match(/G(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get human-readable gate name
   */
  getGateName(gateNumber: number): string {
    const gateNames: Record<number, string> = {
      1: 'Scope Approval',
      2: 'PRD Approval',
      3: 'Architecture Approval',
      4: 'Design Approval',
      5: 'Development Complete',
      6: 'Testing Complete',
      7: 'Security Audit',
      8: 'Staging Deployment',
      9: 'Production Deployment',
    };
    return gateNames[gateNumber] || `Gate ${gateNumber}`;
  }
}
