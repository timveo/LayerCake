import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { AgentExecutionService } from './agent-execution.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';

/**
 * WorkflowCoordinator orchestrates the complete G0-G9 workflow
 * Coordinates between Orchestrator, AgentExecution, and Gates
 */
@Injectable()
export class WorkflowCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly agentExecution: AgentExecutionService,
    private readonly gateStateMachine: GateStateMachineService,
  ) {}

  /**
   * Start project workflow - called after project creation
   */
  async startProjectWorkflow(
    projectId: string,
    userId: string,
    initialRequirements: string,
  ): Promise<{
    projectId: string;
    currentGate: string;
    nextTask: any;
  }> {
    // 1. Initialize project gates and tasks
    await this.orchestrator.initializeProject(projectId, userId);

    // 2. Decompose requirements into agent tasks
    const decomposition = await this.orchestrator.decomposeRequirements(
      projectId,
      initialRequirements,
    );

    // 3. Create tasks from decomposition
    await this.orchestrator.createTasksFromDecomposition(
      projectId,
      userId,
      decomposition,
    );

    // 4. Get first executable task
    const nextTask = await this.orchestrator.getNextExecutableTask(projectId);

    // 5. Get current gate
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    return {
      projectId,
      currentGate: currentGate?.gateType || 'G1_PENDING',
      nextTask,
    };
  }

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
    // Get next executable task
    const nextTask = await this.orchestrator.getNextExecutableTask(projectId);

    if (!nextTask) {
      // Check if we're waiting for gate approval
      const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

      if (currentGate && currentGate.status === 'IN_REVIEW') {
        return {
          started: false,
          reason: `Waiting for gate approval: ${currentGate.gateType}`,
        };
      }

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
    // Note: This uses the streaming endpoint which handles document generation
    // and handoffs automatically in postProcessAgentCompletion()
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: nextTask.owner,
        userPrompt: nextTask.description || nextTask.name,
        model: undefined, // Use template default
      },
      userId,
      {
        onChunk: (chunk: string) => {
          // Chunks are already streamed via WebSocket
        },
        onComplete: async (response) => {
          // Agent completed - check if gate is ready
          await this.checkGateReadiness(projectId, userId);

          // Try to execute next task automatically
          setTimeout(async () => {
            try {
              await this.executeNextTask(projectId, userId);
            } catch (error) {
              console.error('Auto-execution error:', error);
            }
          }, 1000); // Small delay to ensure database is updated
        },
        onError: (error) => {
          console.error('Agent execution error:', error);
        },
      },
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
  private async checkGateReadiness(
    projectId: string,
    userId: string,
  ): Promise<void> {
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

      // TODO: Send notification to user that gate is ready for approval
    }
  }

  /**
   * Handle gate approval - triggers next phase
   */
  async onGateApproved(
    projectId: string,
    gateType: string,
    userId: string,
  ): Promise<void> {
    // Gate was approved, update project phase
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    if (!project || !project.state) {
      return;
    }

    // Update phase based on gate
    const nextPhase = this.getNextPhaseForGate(gateType);
    if (nextPhase) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          state: {
            update: {
              currentPhase: nextPhase as any, // Type assertion for Phase enum
            },
          },
        },
      });
    }

    // Try to execute next task
    await this.executeNextTask(projectId, userId);
  }

  /**
   * Get project workflow status
   */
  async getWorkflowStatus(
    projectId: string,
    userId: string,
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

  /**
   * Map gate type to phase
   */
  private getPhaseForGate(gateType: string): string {
    const gateToPhase: Record<string, string> = {
      G0_COMPLETE: 'pre_startup',
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
   */
  private getNextPhaseForGate(gateType: string): string | null {
    const nextPhaseMap: Record<string, string> = {
      G1_COMPLETE: 'planning',
      G2_COMPLETE: 'architecture',
      G3_COMPLETE: 'design',
      G4_COMPLETE: 'development',
      G5_COMPLETE: 'testing',
      G6_COMPLETE: 'security_review',
      G7_COMPLETE: 'pre_deployment',
      G8_COMPLETE: 'production',
      G9_COMPLETE: 'completion',
    };
    return nextPhaseMap[gateType] || null;
  }
}
