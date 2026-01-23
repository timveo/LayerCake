import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';
import { AgentExecutionService } from './agent-execution.service';
import {
  G1PresentationService,
  G1PresentationData,
} from '../../gates/services/g1-presentation.service';
import { DeploymentMode } from '@prisma/client';

export interface TaskDecompositionResult {
  tasks: Array<{
    agentType: string;
    taskDescription: string;
    priority: 'P0' | 'P1' | 'P2';
    dependencies: string[];
    estimatedDuration?: string;
  }>;
  parallelGroups: string[][];
}

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateStateMachine: GateStateMachineService,
    private readonly agentExecution: AgentExecutionService,
    private readonly g1Presentation: G1PresentationService,
  ) {}

  /**
   * Present G1 gate for user approval.
   *
   * Called after PM Onboarding completes the intake questionnaire.
   * This method:
   * 1. Prepares the G1 presentation data (classification, workflow, risks, assumptions)
   * 2. Records artifacts (risks, deliverables, decisions) in the database
   * 3. Updates the project with deployment mode
   * 4. Transitions the gate to IN_REVIEW
   * 5. Returns formatted presentation for the user
   */
  async presentG1Gate(
    projectId: string,
    userId: string,
  ): Promise<{
    presentationContent: string;
    presentationData: G1PresentationData;
  }> {
    // 1. Prepare G1 presentation data
    const presentationData = await this.g1Presentation.prepareG1Presentation(projectId);

    // 2. Record artifacts using integrated services (risks, deliverables, decisions)
    await this.g1Presentation.recordG1Artifacts(projectId, presentationData, userId);

    // 3. Update project type and state with deployment mode
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        type: presentationData.projectType as any,
        state: {
          update: {
            deploymentMode: this.mapDeploymentMode(presentationData.deploymentMode),
          },
        },
      },
    });

    // 4. Transition gate to IN_REVIEW
    await this.gateStateMachine.transitionToReview(projectId, 'G1_PENDING', {
      description: 'G1 - Project Scope Approval ready for review',
      passingCriteria: 'User has reviewed project classification, workflow, risks, and assumptions',
    });

    // 5. Format and return presentation
    const presentationContent = this.g1Presentation.formatG1Presentation(presentationData);

    return { presentationContent, presentationData };
  }

  /**
   * Map string deployment mode to Prisma enum
   */
  private mapDeploymentMode(mode: string): DeploymentMode {
    switch (mode) {
      case 'LOCAL_ONLY':
        return DeploymentMode.LOCAL_ONLY;
      case 'OPTIONAL':
        return DeploymentMode.OPTIONAL;
      case 'REQUIRED':
        return DeploymentMode.REQUIRED;
      default:
        return DeploymentMode.UNDETERMINED;
    }
  }

  /**
   * Initialize project workflow and create initial tasks
   */
  async initializeProject(projectId: string, _userId: string): Promise<void> {
    // Initialize gates
    await this.gateStateMachine.initializeProjectGates(projectId);

    // Get project details
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    // Create initial task for Orchestrator to analyze requirements
    await this.prisma.task.create({
      data: {
        projectId,
        phase: 'intake',
        name: 'Orchestrator: Analyze requirements and create project plan',
        title: 'Orchestrator: Analyze requirements and create project plan',
        description: 'Review intake form and decompose project into tasks',
        status: 'not_started',
        priority: 'CRITICAL',
        owner: 'ORCHESTRATOR',
      },
    });

    // Update project state
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        state: {
          update: {
            currentPhase: 'intake',
            currentGate: 'G1_PENDING',
          },
        },
      },
    });
  }

  /**
   * Decompose user requirements into agent tasks
   */
  async decomposeRequirements(
    projectId: string,
    _requirements: string,
  ): Promise<TaskDecompositionResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const projectType = project.type;

    // Define agent workflow based on project type
    const workflow = this.getWorkflowForProjectType(projectType);

    // Create tasks for each stage
    const tasks: TaskDecompositionResult['tasks'] = [];
    const parallelGroups: string[][] = [];

    // G1-G2: Requirements (Product Manager)
    tasks.push({
      agentType: 'PRODUCT_MANAGER',
      taskDescription: 'Create PRD from intake and requirements',
      priority: 'P0',
      dependencies: [],
      estimatedDuration: '15-30 minutes',
    });

    // G3: Architecture (Architect)
    tasks.push({
      agentType: 'ARCHITECT',
      taskDescription: 'Create OpenAPI spec, Prisma schema, and Zod validation',
      priority: 'P0',
      dependencies: ['PRODUCT_MANAGER'],
      estimatedDuration: '30-45 minutes',
    });

    // G4: Design (UX/UI Designer) - only for UI projects
    if (workflow.includesDesign) {
      tasks.push({
        agentType: 'UX_UI_DESIGNER',
        taskDescription: 'Create 3 design options with design system',
        priority: 'P0',
        dependencies: ['ARCHITECT'],
        estimatedDuration: '30-45 minutes',
      });
    }

    // G5: Development (parallel execution)
    const developmentAgents: string[] = [];

    if (workflow.includesFrontend) {
      tasks.push({
        agentType: 'FRONTEND_DEVELOPER',
        taskDescription: 'Implement React components from design system and specs',
        priority: 'P0',
        dependencies: workflow.includesDesign ? ['UX_UI_DESIGNER'] : ['ARCHITECT'],
        estimatedDuration: '1-2 hours',
      });
      developmentAgents.push('FRONTEND_DEVELOPER');
    }

    if (workflow.includesBackend) {
      tasks.push({
        agentType: 'BACKEND_DEVELOPER',
        taskDescription: 'Implement API endpoints and business logic from OpenAPI spec',
        priority: 'P0',
        dependencies: ['ARCHITECT'],
        estimatedDuration: '1-2 hours',
      });
      developmentAgents.push('BACKEND_DEVELOPER');
    }

    if (workflow.includesML) {
      tasks.push({
        agentType: 'DATA_ENGINEER',
        taskDescription: 'Build ETL pipelines and data quality checks',
        priority: 'P0',
        dependencies: ['ARCHITECT'],
        estimatedDuration: '1-2 hours',
      });
      developmentAgents.push('DATA_ENGINEER');

      tasks.push({
        agentType: 'ML_ENGINEER',
        taskDescription: 'Train and optimize ML models',
        priority: 'P0',
        dependencies: ['DATA_ENGINEER'],
        estimatedDuration: '2-4 hours',
      });
      developmentAgents.push('ML_ENGINEER');

      tasks.push({
        agentType: 'PROMPT_ENGINEER',
        taskDescription: 'Design and test LLM prompts',
        priority: 'P0',
        dependencies: ['ARCHITECT'],
        estimatedDuration: '30-60 minutes',
      });
      developmentAgents.push('PROMPT_ENGINEER');
    }

    // Track parallel groups
    if (developmentAgents.length > 1) {
      parallelGroups.push(developmentAgents);
    }

    // G6: Testing (QA Engineer)
    tasks.push({
      agentType: 'QA_ENGINEER',
      taskDescription: 'Create E2E tests and generate coverage report',
      priority: 'P0',
      dependencies: developmentAgents,
      estimatedDuration: '45-60 minutes',
    });

    if (workflow.includesML) {
      tasks.push({
        agentType: 'MODEL_EVALUATOR',
        taskDescription: 'Evaluate model performance and recommend optimal model',
        priority: 'P0',
        dependencies: ['ML_ENGINEER', 'PROMPT_ENGINEER'],
        estimatedDuration: '30-45 minutes',
      });
    }

    // G7: Security (Security Engineer)
    tasks.push({
      agentType: 'SECURITY_ENGINEER',
      taskDescription: 'Perform OWASP security audit and fix vulnerabilities',
      priority: 'P0',
      dependencies: ['QA_ENGINEER'],
      estimatedDuration: '30-45 minutes',
    });

    // G8-G9: Deployment
    const deploymentAgent = workflow.includesML ? 'AIOPS_ENGINEER' : 'DEVOPS_ENGINEER';
    tasks.push({
      agentType: deploymentAgent,
      taskDescription: 'Deploy to staging and production with monitoring',
      priority: 'P0',
      dependencies: ['SECURITY_ENGINEER'],
      estimatedDuration: '30-45 minutes',
    });

    return { tasks, parallelGroups };
  }

  /**
   * Route task to appropriate agent based on current gate
   */
  async routeTaskToAgent(
    projectId: string,
    _userId: string,
  ): Promise<{
    agentType: string;
    taskDescription: string;
  } | null> {
    // Get current gate
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    if (!currentGate) {
      return null;
    }

    // Get project type
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return null;
    }

    // Map gate to agent
    const agentMapping = this.getAgentForGate(currentGate.gateType, project.type);

    if (!agentMapping) {
      return null;
    }

    return agentMapping;
  }

  /**
   * Create tasks in database from decomposition
   * Optimized: Uses createMany for bulk insert (single query instead of N queries)
   */
  async createTasksFromDecomposition(
    projectId: string,
    userId: string,
    decomposition: TaskDecompositionResult,
  ): Promise<void> {
    // Map all tasks to database format
    const taskData = decomposition.tasks.map((task) => {
      // Map priority to Task schema format
      let priorityValue: string;
      if (task.priority === 'P0') priorityValue = 'CRITICAL';
      else if (task.priority === 'P1') priorityValue = 'HIGH';
      else priorityValue = 'MEDIUM';

      return {
        projectId,
        phase: this.getPhaseForAgent(task.agentType),
        name: `${task.agentType}: ${task.taskDescription}`,
        title: `${task.agentType}: ${task.taskDescription}`,
        description: task.taskDescription,
        status: 'not_started' as const,
        priority: priorityValue,
        owner: task.agentType,
      };
    });

    // Bulk insert all tasks in a single query
    await this.prisma.task.createMany({
      data: taskData,
    });
  }

  /**
   * Map agent type to phase
   */
  private getPhaseForAgent(agentType: string): string {
    const agentToPhase: Record<string, string> = {
      ORCHESTRATOR: 'intake',
      PRODUCT_MANAGER: 'planning',
      ARCHITECT: 'architecture',
      UX_UI_DESIGNER: 'design',
      FRONTEND_DEVELOPER: 'development',
      BACKEND_DEVELOPER: 'development',
      ML_ENGINEER: 'development',
      DATA_ENGINEER: 'development',
      PROMPT_ENGINEER: 'development',
      QA_ENGINEER: 'testing',
      MODEL_EVALUATOR: 'testing',
      SECURITY_ENGINEER: 'security_review',
      DEVOPS_ENGINEER: 'pre_deployment',
      AIOPS_ENGINEER: 'pre_deployment',
    };
    return agentToPhase[agentType] || 'development';
  }

  /**
   * Get next pending task that can be executed
   *
   * Note: Task dependencies are tracked via parentTaskId relationships in the schema.
   * A task is executable when its parent task is completed.
   */
  async getNextExecutableTask(projectId: string): Promise<any | null> {
    // Get all not_started tasks
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        projectId,
        status: 'not_started',
      },
      include: {
        parentTask: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    // Find first task where parent is complete (or no parent)
    for (const task of pendingTasks) {
      // If no parent task, it's ready to execute
      if (!task.parentTaskId) {
        return task;
      }

      // Check if parent task is complete
      if (task.parentTask && task.parentTask.status === 'complete') {
        return task;
      }
    }

    return null;
  }

  /**
   * Coordinate agent handoff with context
   * Uses transaction to ensure handoff and deliverables are created atomically
   */
  async coordinateHandoff(
    projectId: string,
    fromAgent: string,
    toAgent: string,
    phase: string,
    deliverables: string[],
    notes?: string,
  ): Promise<void> {
    // Use transaction to ensure handoff and deliverables are created atomically
    await this.prisma.$transaction(async (tx) => {
      // Record handoff in database
      const handoff = await tx.handoff.create({
        data: {
          projectId,
          fromAgent,
          toAgent,
          phase,
          status: 'partial', // Use 'partial' until fully complete
          notes: notes || `Handoff from ${fromAgent} to ${toAgent}`,
        },
      });

      // Create handoff deliverables in bulk (single query)
      if (deliverables.length > 0) {
        await tx.handoffDeliverable.createMany({
          data: deliverables.map((deliverable) => ({
            handoffId: handoff.id,
            deliverable,
          })),
        });
      }

      // Update task status for target agent
      await tx.task.updateMany({
        where: {
          projectId,
          owner: toAgent,
          status: 'not_started',
        },
        data: {
          status: 'not_started', // Keep as not_started until explicitly picked up
        },
      });
    });
  }

  /**
   * Track progress across all agents
   */
  async getProjectProgress(projectId: string): Promise<{
    currentGate: string;
    currentPhase: string;
    percentComplete: number;
    completedTasks: number;
    totalTasks: number;
    nextActions: string[];
  }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        state: true,
        tasks: true,
      },
    });

    if (!project || !project.state) {
      throw new BadRequestException('Project not found');
    }

    const tasks = project.tasks || [];
    const completedTasks = tasks.filter((t) => t.status === 'complete').length;
    const totalTasks = tasks.length;

    // Get next executable tasks
    const nextTask = await this.getNextExecutableTask(projectId);
    const nextActions: string[] = [];

    if (nextTask) {
      nextActions.push(`Execute ${nextTask.owner}: ${nextTask.description || nextTask.name}`);
    }

    // Get current gate
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);
    if (currentGate && currentGate.status === 'IN_REVIEW') {
      nextActions.push(`Approve gate ${currentGate.gateType}`);
    }

    return {
      currentGate: project.state.currentGate,
      currentPhase: project.state.currentPhase,
      percentComplete: totalTasks > 0 ? Math.floor((completedTasks / totalTasks) * 100) : 0,
      completedTasks,
      totalTasks,
      nextActions,
    };
  }

  /**
   * Get workflow configuration for project type
   */
  private getWorkflowForProjectType(projectType: string): {
    includesDesign: boolean;
    includesFrontend: boolean;
    includesBackend: boolean;
    includesML: boolean;
  } {
    switch (projectType) {
      case 'traditional':
        return {
          includesDesign: true,
          includesFrontend: true,
          includesBackend: true,
          includesML: false,
        };

      case 'ai_ml':
        return {
          includesDesign: false,
          includesFrontend: false,
          includesBackend: true,
          includesML: true,
        };

      case 'hybrid':
        return {
          includesDesign: true,
          includesFrontend: true,
          includesBackend: true,
          includesML: true,
        };

      case 'enhancement':
        // Determine based on existing codebase
        return {
          includesDesign: false,
          includesFrontend: false,
          includesBackend: false,
          includesML: false,
        };

      default:
        return {
          includesDesign: true,
          includesFrontend: true,
          includesBackend: true,
          includesML: false,
        };
    }
  }

  /**
   * Get agent type for specific gate and project type
   */
  private getAgentForGate(
    gateType: string,
    projectType: string,
  ): { agentType: string; taskDescription: string } | null {
    const gateToAgent: Record<string, { agentType: string; taskDescription: string }> = {
      G1_PENDING: {
        agentType: 'ORCHESTRATOR',
        taskDescription: 'Analyze intake and plan project workflow',
      },
      G2_PENDING: {
        agentType: 'PRODUCT_MANAGER',
        taskDescription: 'Create PRD from requirements',
      },
      G3_PENDING: {
        agentType: 'ARCHITECT',
        taskDescription: 'Design architecture and create specifications',
      },
      G4_PENDING: {
        agentType: 'UX_UI_DESIGNER',
        taskDescription: 'Create design options and design system',
      },
      G5_PENDING: {
        agentType: 'FRONTEND_DEVELOPER', // Can be parallel with backend
        taskDescription: 'Implement features from specifications',
      },
      G6_PENDING: {
        agentType: 'QA_ENGINEER',
        taskDescription: 'Create and execute test plan',
      },
      G7_PENDING: {
        agentType: 'SECURITY_ENGINEER',
        taskDescription: 'Perform security audit',
      },
      G8_PENDING: {
        agentType:
          projectType === 'ai_ml' || projectType === 'hybrid'
            ? 'AIOPS_ENGINEER'
            : 'DEVOPS_ENGINEER',
        taskDescription: 'Deploy to staging environment',
      },
      G9_PENDING: {
        agentType:
          projectType === 'ai_ml' || projectType === 'hybrid'
            ? 'AIOPS_ENGINEER'
            : 'DEVOPS_ENGINEER',
        taskDescription: 'Deploy to production environment',
      },
    };

    return gateToAgent[gateType] || null;
  }
}
