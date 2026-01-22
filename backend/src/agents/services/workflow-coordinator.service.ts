import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { AgentExecutionService } from './agent-execution.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { AIProviderService } from './ai-provider.service';
import { GateDocumentsService } from '../../documents/services/gate-documents.service';

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
    @Inject(forwardRef(() => AppWebSocketGateway))
    private readonly wsGateway: AppWebSocketGateway,
    private readonly aiProvider: AIProviderService,
    private readonly gateDocuments: GateDocumentsService,
  ) {}

  /**
   * Extract a concise project name from user requirements using LLM
   */
  private async extractProjectName(requirements: string): Promise<string> {
    try {
      const response = await this.aiProvider.executeClaudePrompt(
        `You extract concise project names from user descriptions.
Return ONLY the project name, nothing else.
The name should be 2-5 words, descriptive, and professional.
Examples:
- "I want to build a website for my plumbing company" → "Plumbing Company Website"
- "Create an app to track my fitness goals" → "Fitness Tracker App"
- "Build a dashboard for managing inventory" → "Inventory Management Dashboard"`,
        requirements,
        'claude-3-5-haiku-20241022', // Use Haiku for speed/cost
        50, // Short response
      );

      // Clean up the response - remove quotes, trim
      const name = response.content.replace(/["']/g, '').trim();
      return name || 'New Project';
    } catch (error) {
      console.error('Failed to extract project name:', error);
      return 'New Project';
    }
  }

  /**
   * Start project workflow - called after project creation
   * This triggers the PM Onboarding agent to conduct the intake conversation
   */
  async startProjectWorkflow(
    projectId: string,
    userId: string,
    initialRequirements: string,
  ): Promise<{
    projectId: string;
    currentGate: string;
    message: string;
    agentExecutionId?: string;
  }> {
    // 0. Extract proper project name using LLM and update project
    const projectName = await this.extractProjectName(initialRequirements);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { name: projectName },
    });

    // 1. Initialize project gates
    await this.orchestrator.initializeProject(projectId, userId);

    // 2. Get current gate (should be G1_PENDING after initialization)
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    // 3. Start the PM Onboarding agent for the intake conversation
    // This agent will ask the 5 required questions and create PROJECT_INTAKE.md
    const agentExecutionId = await this.startOnboardingAgent(
      projectId,
      userId,
      projectName,
      initialRequirements,
    );

    return {
      projectId,
      currentGate: currentGate?.gateType || 'G1_PENDING',
      message: 'Onboarding started. Product Manager will guide you through project discovery.',
      agentExecutionId,
    };
  }

  /**
   * Start the PM Onboarding agent to conduct the intake conversation
   */
  private async startOnboardingAgent(
    projectId: string,
    userId: string,
    projectName: string,
    requirements: string,
  ): Promise<string> {
    const userPrompt = `The user wants to create a new project called "${projectName}".

Here is their initial project description:
"${requirements}"

IMPORTANT: This is just their initial idea. You have NOT asked any questions yet. None of the 5 required questions have been answered.

Begin by warmly acknowledging their project idea, then ask your FIRST question about existing code. Remember: ask only ONE question at a time and wait for the user's response before asking the next.`;

    // Track execution ID for callbacks (set after executeAgentStream returns)
    let executionId: string | null = null;

    // executeAgentStream now returns the ID immediately, streaming happens in background
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'PRODUCT_MANAGER_ONBOARDING',
        userPrompt,
        model: undefined, // Use template default
      },
      userId,
      {
        onChunk: (chunk: string) => {
          if (executionId) {
            this.wsGateway.emitAgentChunk(projectId, executionId, chunk);
          }
        },
        onComplete: async (response) => {
          if (executionId) {
            this.wsGateway.emitAgentCompleted(projectId, executionId, {
              content: response.content,
              usage: response.usage,
              finishReason: response.finishReason,
            });
          }

          // The agent has asked the first question - now we wait for user response
          // User responses will be handled via sendOnboardingMessage()
        },
        onError: (error) => {
          console.error('Onboarding agent error:', error);
          if (executionId) {
            this.wsGateway.emitAgentFailed(projectId, executionId, error.message);
          }
        },
      },
    );

    // Set execution ID for callbacks
    executionId = agentExecutionId;

    // Emit agent started event
    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'PRODUCT_MANAGER_ONBOARDING',
      'Project onboarding conversation',
    );

    return agentExecutionId;
  }

  /**
   * Send a message to the onboarding agent (user response to a question)
   */
  async sendOnboardingMessage(
    projectId: string,
    userId: string,
    message: string,
  ): Promise<{ agentExecutionId: string; gateApproved?: boolean }> {
    // Get project context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Check if intake document exists (meaning onboarding questions are complete)
    const intakeDocument = await this.prisma.document.findFirst({
      where: {
        projectId,
        title: 'Project Intake',
      },
    });

    // Check current gate status
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    // Detect approval keywords
    const approvalKeywords = [
      'approved',
      'approve',
      'looks good',
      'lgtm',
      'confirm',
      'accept',
      'yes',
    ];
    const isApprovalMessage = approvalKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword),
    );

    // ============================================================
    // G1 APPROVAL FLOW (Single Step)
    // When intake exists and user says approve, approve the gate
    // ============================================================

    if (isApprovalMessage && intakeDocument) {
      console.log('Processing G1 approval for project:', projectId);

      // Ensure gate is in review state, then approve
      const gateStatus = currentGate?.status;
      if (gateStatus !== 'IN_REVIEW') {
        await this.gateStateMachine.transitionToReview(projectId, 'G1_PENDING', {
          description: 'G1 - Project Scope ready for approval',
        });
      }

      // Approve the gate
      await this.gateStateMachine.approveGate(
        projectId,
        'G1_PENDING',
        userId,
        'approved',
        'User approved via chat',
      );

      // Trigger post-approval processing (creates tasks, post-G1 documents)
      await this.onGateApproved(projectId, 'G1_PENDING', userId);

      // Send confirmation message
      const approvalConfirmation = `## G1 Approved - Project Scope Confirmed

Your project scope has been approved and tasks have been created for all agents.

**Ready for G2 - Product Requirements**

The Product Manager agent can now create your **Product Requirements Document (PRD)** which includes:
- User stories and acceptance criteria
- Feature prioritization
- Success metrics

Type **"continue"** to start PRD creation, or ask me any questions about the project.`;

      this.wsGateway.emitAgentChunk(projectId, 'g1-approved', approvalConfirmation);
      this.wsGateway.emitAgentCompleted(projectId, 'g1-approved', {
        content: approvalConfirmation,
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'end_turn',
      });

      return { agentExecutionId: 'g1-approval-processed', gateApproved: true };
    }

    // ============================================================
    // POST-G1: User message after G1 is approved
    // Use AI to determine if they want to continue to G2
    // ============================================================
    const g1Gate = await this.prisma.gate.findFirst({
      where: { projectId, gateType: 'G1_PENDING' },
    });
    const isG1Approved = g1Gate?.status === 'APPROVED';

    if (isG1Approved && intakeDocument) {
      console.log('G1 approved - processing post-G1 user message:', message);

      // Use the orchestrator agent to evaluate if user wants to continue
      return this.handlePostG1Message(projectId, userId, message);
    }

    // ============================================================
    // If intake document exists but G1 not yet approved,
    // guide them to review and approve
    // ============================================================
    if (intakeDocument) {
      console.log('Intake exists - guiding user to approval');

      const guidanceMessage = `Your Project Intake is ready for review in the **Docs** tab.

Type **"approve"** to approve the intake document and proceed to the planning phase.`;

      this.wsGateway.emitAgentChunk(projectId, 'guidance', guidanceMessage);
      this.wsGateway.emitAgentCompleted(projectId, 'guidance', {
        content: guidanceMessage,
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'end_turn',
      });

      return { agentExecutionId: 'guidance-provided', gateApproved: false };
    }

    // Get conversation history (previous agent executions for this project)
    const previousExecutions = await this.prisma.agent.findMany({
      where: {
        projectId,
        agentType: 'PRODUCT_MANAGER_ONBOARDING',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        contextData: true,
        outputResult: true,
      },
    });

    // Build conversation context from actual user messages (stored in contextData)
    // and assistant responses (stored in outputResult)
    let conversationContext = '';
    for (const exec of previousExecutions) {
      // Get the actual user message from contextData if available
      const contextData = exec.contextData as { userMessage?: string } | null;
      const userMessage = contextData?.userMessage;

      if (userMessage) {
        conversationContext += `User: ${userMessage}\n\n`;
      }
      if (exec.outputResult) {
        conversationContext += `Assistant: ${exec.outputResult}\n\n`;
      }
    }

    // Count questions answered based on conversation turns
    // Turn 0 (initial): Welcome message + Q1 asked
    // Turn 1: User answers Q1, agent asks Q2
    // Turn 2: User answers Q2, agent asks Q3
    // etc.
    // So after N previous executions, user is on answer N+1
    const questionsAnsweredSoFar = previousExecutions.length; // Turns completed = questions answered
    const currentQuestionBeingAnswered = questionsAnsweredSoFar + 1; // User is answering this question now
    const nextQuestionToAsk = currentQuestionBeingAnswered + 1; // After they answer, ask this one

    const userPrompt = `${conversationContext}User: ${message}

=== CRITICAL: QUESTION TRACKING ===

Questions answered so far: ${questionsAnsweredSoFar}
User is NOW answering question: #${currentQuestionBeingAnswered}
Next question to ask: #${nextQuestionToAsk}

The 5 REQUIRED questions (you MUST ask ALL of them):
1. Existing Code - "Do you have any existing code for this project?"
2. Technical Background - "What's your technical background?"
3. Success Criteria - "What does 'done' look like for you?"
4. Constraints - "Any constraints? (timeline, budget, tech requirements)"
5. Deployment - "How do you want to deploy this?"

=== YOUR TASK ===

${
  nextQuestionToAsk <= 5
    ? `You have ${5 - questionsAnsweredSoFar} more questions to ask.

1. Acknowledge the user's answer to question #${currentQuestionBeingAnswered} briefly (1 sentence)
2. Ask question #${nextQuestionToAsk} in a conversational way

DO NOT output the intake document yet. DO NOT skip questions.`
    : `All 5 questions have been answered! Now output the complete Project Intake document inside a markdown code fence.

IMPORTANT: Output ONLY the document. No additional text after the closing \`\`\`.`
}

Remember: NEVER output the intake document until you have received answers to ALL 5 questions.`;

    // executeAgentStream now returns the ID immediately, streaming happens in background
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'PRODUCT_MANAGER_ONBOARDING',
        userPrompt,
        model: undefined,
        context: { userMessage: message }, // Store the actual user message for history
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

          // Check if the intake document was generated AND all 5 questions were answered
          // The document should only be created after 5 questions (5 user messages after initial)
          const hasIntakeDocument = response.content.includes('# Project Intake:');
          const enoughQuestionsAnswered = questionsAnsweredSoFar >= 4; // This message would be answer #5

          if (hasIntakeDocument && enoughQuestionsAnswered) {
            await this.handleOnboardingComplete(projectId, userId, response.content);
          } else if (hasIntakeDocument && !enoughQuestionsAnswered) {
            // Agent tried to complete early - log this as an issue
            console.warn(
              `Agent output intake document too early! Only ${questionsAnsweredSoFar + 1} questions answered.`,
            );
          }
        },
        onError: (error) => {
          console.error('Onboarding message error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'PRODUCT_MANAGER_ONBOARDING',
      'Continuing onboarding conversation',
    );

    // Return the execution ID - gate approval is now handled separately
    return { agentExecutionId, gateApproved: false };
  }

  /**
   * Handle user messages after G1 is approved
   * Uses AI to evaluate intent and respond appropriately
   */
  private async handlePostG1Message(
    projectId: string,
    userId: string,
    message: string,
  ): Promise<{ agentExecutionId: string; gateApproved: boolean }> {
    // Get project and intake document for context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    const intakeDocument = await this.prisma.document.findFirst({
      where: { projectId, title: 'Project Intake' },
    });

    const projectContext = intakeDocument?.content || project?.name || 'the project';

    // Build the prompt for the orchestrator to evaluate the user's intent
    const userPrompt = `You are the Project Orchestrator for "${project?.name}".

The user has completed G1 (Project Scope Approval). Their Project Intake has been approved.

**Current State:**
- G1 is APPROVED
- Tasks have been created for all agents
- Ready to start G2 (Product Requirements Document creation)

**Project Summary:**
${projectContext.substring(0, 2000)}

**User's Message:**
"${message}"

**Your Task:**
Respond to the user's message naturally. You can:
1. Answer questions about the project or process
2. If they indicate they want to proceed/continue/start G2, respond with enthusiasm and confirm you're starting PRD creation. Include the exact phrase "STARTING_G2_PRD_CREATION" at the end of your response (this is a system trigger).
3. If they have concerns or want changes, address them helpfully

Keep your response concise and helpful.`;

    // Execute the agent
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'ORCHESTRATOR',
        userPrompt,
        model: undefined,
        context: { userMessage: message },
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

          // Check if the agent indicated to start G2
          if (response.content.includes('STARTING_G2_PRD_CREATION')) {
            console.log('Starting G2 PRD creation for project:', projectId);
            await this.startProductManagerAgent(projectId, userId);
          }
        },
        onError: (error) => {
          console.error('Post-G1 message error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'ORCHESTRATOR',
      'Processing your request',
    );

    return { agentExecutionId, gateApproved: false };
  }

  /**
   * Start the Product Manager agent to create the PRD for G2
   */
  private async startProductManagerAgent(
    projectId: string,
    userId: string,
  ): Promise<string> {
    // Get project and intake document for context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    const intakeDocument = await this.prisma.document.findFirst({
      where: { projectId, title: 'Project Intake' },
    });

    const userPrompt = `Create a comprehensive Product Requirements Document (PRD) for the project "${project?.name}".

**Project Intake Document:**
${intakeDocument?.content || 'No intake document found'}

**Your Task:**
Create a detailed PRD that includes:

1. **Executive Summary** - Brief overview of the product
2. **Problem Statement** - What problem does this solve?
3. **Goals and Objectives** - Measurable success criteria
4. **User Stories** - Detailed user stories with acceptance criteria in the format:
   - As a [user type], I want [goal] so that [benefit]
   - Acceptance Criteria: [specific testable criteria]
5. **Feature Prioritization** - MVP features vs Phase 2 features
6. **Non-Functional Requirements** - Performance, security, scalability
7. **Success Metrics** - KPIs to measure success
8. **Timeline Considerations** - Based on user's constraints

Output the complete PRD document in markdown format.`;

    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'PRODUCT_MANAGER',
        userPrompt,
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

          // Save the PRD as a document
          await this.savePRDDocument(projectId, userId, response.content);
        },
        onError: (error) => {
          console.error('Product Manager agent error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'PRODUCT_MANAGER',
      'Creating Product Requirements Document',
    );

    return agentExecutionId;
  }

  /**
   * Save the PRD document and notify the user it's ready for G2 review
   */
  private async savePRDDocument(
    projectId: string,
    userId: string,
    prdContent: string,
  ): Promise<void> {
    console.log('Saving PRD document for project:', projectId);

    // Save PRD as document
    const document = await this.prisma.document.create({
      data: {
        projectId,
        title: 'Product Requirements Document',
        documentType: 'REQUIREMENTS',
        content: prdContent,
        version: 1,
        createdById: userId,
      },
    });

    // Notify frontend about new document
    this.wsGateway.emitDocumentCreated(projectId, {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
    });

    // Transition G2 gate to IN_REVIEW
    try {
      await this.gateStateMachine.transitionToReview(projectId, 'G1_COMPLETE', {
        description: 'G2 - Product Requirements Document ready for review',
      });
    } catch (error) {
      console.error('Failed to transition G2 gate:', error);
    }

    // Send notification that PRD is ready
    const readyMessage = `## PRD Ready for Review

Your **Product Requirements Document** is now available in the Docs tab.

Please review the PRD and type **"approve"** to proceed to G3 (Architecture), or let me know if you'd like any changes.`;

    this.wsGateway.emitAgentChunk(projectId, 'g2-ready', readyMessage);
    this.wsGateway.emitAgentCompleted(projectId, 'g2-ready', {
      content: readyMessage,
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'end_turn',
    });
  }

  /**
   * Handle completion of onboarding - extract and save PROJECT_INTAKE.md
   * Display a brief G1 summary directly in chat and ask for approval.
   */
  private async handleOnboardingComplete(
    projectId: string,
    userId: string,
    agentResponse: string,
  ): Promise<void> {
    // Extract the markdown document from the response
    // The document is wrapped in ```markdown ... ``` code fence
    let intakeContent: string;

    // Try to extract from markdown code fence first (greedy to get all content)
    const intakeMatch = agentResponse.match(/```markdown\n([\s\S]+)```\s*$/);
    if (intakeMatch) {
      intakeContent = intakeMatch[1].trim();
    } else {
      // Fallback: find the # Project Intake: heading and take everything from there
      const headingIndex = agentResponse.indexOf('# Project Intake:');
      if (headingIndex !== -1) {
        intakeContent = agentResponse.substring(headingIndex).trim();
      } else {
        // Last resort: use the whole response
        intakeContent = agentResponse;
      }
    }

    console.log('Creating Project Intake document, content length:', intakeContent.length);

    // Save intake as document (for reference in Docs tab)
    const document = await this.prisma.document.create({
      data: {
        projectId,
        title: 'Project Intake',
        documentType: 'REQUIREMENTS',
        content: intakeContent,
        version: 1,
        createdById: userId,
      },
    });

    // Notify frontend that Project Intake document was created
    this.wsGateway.emitDocumentCreated(projectId, {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
    });

    // Simple message asking user to review and approve the intake document
    const approvalMessage = `Your **Project Intake** document is ready for review in the Docs tab.

Please review it and type **"approve"** to proceed, or let me know if you'd like any changes.`;

    this.wsGateway.emitAgentChunk(projectId, 'onboarding-complete', approvalMessage);
    this.wsGateway.emitAgentCompleted(projectId, 'onboarding-complete', {
      content: approvalMessage,
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'end_turn',
    });
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
          // Emit chunk via WebSocket
          this.wsGateway.emitAgentChunk(projectId, agentExecutionId, chunk);
        },
        onComplete: async (response) => {
          // Emit completion via WebSocket
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
          }, 1000); // Small delay to ensure database is updated
        },
        onError: (error) => {
          console.error('Agent execution error:', error);
          // Emit error via WebSocket
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

      // TODO: Send notification to user that gate is ready for approval
    }
  }

  /**
   * Handle gate approval - triggers next phase and creates post-gate documents.
   *
   * Per the framework:
   * - G1 creates: FEEDBACK_LOG.md, COST_LOG.md, PROJECT_CONTEXT.md
   * - G2 creates: CHANGE_REQUESTS.md
   * - G9 creates: POST_LAUNCH.md
   */
  async onGateApproved(projectId: string, gateType: string, userId: string): Promise<void> {
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

    // ============================================================
    // G1 Approval: Decompose requirements and create post-gate documents
    // ============================================================
    try {
      if (gateType === 'G1_PENDING' || gateType === 'G1_COMPLETE') {
        console.log('G1 approved - processing post-approval tasks for project:', projectId);

        // Check if tasks already exist (might be called from chat approval path)
        const existingTasks = await this.prisma.task.count({
          where: {
            projectId,
            owner: 'PRODUCT_MANAGER',
          },
        });

        if (existingTasks === 0) {
          // Need to decompose requirements and create tasks
          console.log('Decomposing requirements and creating tasks for all agents');

          // Get the intake document
          const intakeDocument = await this.prisma.document.findFirst({
            where: { projectId, title: 'Project Intake' },
          });

          if (intakeDocument) {
            const requirements =
              intakeDocument.content || 'Build the project as specified in the intake document';

            // Decompose into agent tasks
            const decomposition = await this.orchestrator.decomposeRequirements(
              projectId,
              requirements,
            );
            console.log('Created decomposition with', decomposition.tasks.length, 'tasks');

            // Create tasks in database
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

          // Notify frontend about new documents
          for (const docTitle of createdDocs) {
            this.wsGateway.emitDocumentCreated(projectId, {
              id: '', // ID not available from createMany
              title: docTitle,
              documentType: 'OTHER',
            });
          }
        }
      } else if (gateType === 'G2_PENDING' || gateType === 'G2_COMPLETE') {
        console.log('Creating post-G2 documents for project:', projectId);

        await this.gateDocuments.initializeGateDocuments(projectId, 'G2', userId, {
          projectName: project.name,
        });
      } else if (gateType === 'G9_PENDING' || gateType === 'G9_COMPLETE') {
        console.log('Creating post-G9 documents for project:', projectId);

        await this.gateDocuments.initializeGateDocuments(projectId, 'G9', userId, {
          projectName: project.name,
        });
      }
    } catch (error) {
      console.error('Error creating post-gate documents:', error);
      // Don't fail the gate approval if document creation fails
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

  /**
   * Submit intake answers from the onboarding questions
   * This stores the answers and transitions to G1 for scope approval
   */
  async submitIntakeAnswers(
    projectId: string,
    userId: string,
    answers: { questionId: string; answer: string }[],
  ): Promise<{
    message: string;
    currentGate: string;
    nextStep: string;
  }> {
    // Verify project exists and user has access
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Store intake answers as a document
    const intakeContent = answers.map((a) => `## ${a.questionId}\n${a.answer}`).join('\n\n');

    // Check if intake document already exists
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        projectId,
        title: 'Project Intake',
      },
    });

    if (existingDoc) {
      await this.prisma.document.update({
        where: { id: existingDoc.id },
        data: {
          content: intakeContent,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.document.create({
        data: {
          projectId,
          documentType: 'REQUIREMENTS',
          title: 'Project Intake',
          content: intakeContent,
          createdById: userId,
        },
      });
    }

    // Update user's teaching level if provided
    const technicalBackground = answers.find((a) => a.questionId === 'technical_background');
    if (technicalBackground) {
      const levelMap: Record<string, string> = {
        NOVICE: 'NOVICE',
        INTERMEDIATE: 'INTERMEDIATE',
        EXPERT: 'EXPERT',
      };
      const teachingLevel = levelMap[technicalBackground.answer];
      if (teachingLevel) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { teachingLevel: teachingLevel as any },
        });
      }
    }

    // Initialize project if not already done
    await this.orchestrator.initializeProject(projectId, userId);

    // Get initial requirements from project description or intake
    const successCriteria = answers.find((a) => a.questionId === 'success_criteria');
    const requirements = successCriteria?.answer || 'Project requirements from intake';

    // Decompose requirements and create initial tasks
    const decomposition = await this.orchestrator.decomposeRequirements(projectId, requirements);

    await this.orchestrator.createTasksFromDecomposition(projectId, userId, decomposition);

    // Get current gate status
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    return {
      message: 'Intake answers submitted successfully',
      currentGate: currentGate?.gateType || 'G1_PENDING',
      nextStep: 'Scope approval at Gate 1',
    };
  }

  /**
   * Map gate type to phase
   */
  private getPhaseForGate(gateType: string): string {
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
