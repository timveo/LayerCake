import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { AgentExecutionService } from './agent-execution.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { AIProviderService } from './ai-provider.service';
import { GateDocumentsService } from '../../documents/services/gate-documents.service';
import { EventStoreService } from '../../events/event-store.service';
import { SessionContextService } from '../../session-context/session-context.service';
import { GitIntegrationService } from '../../code-generation/git-integration.service';
import { getAgentsForGate, getAgentTaskDescription, isParallelGate } from '../../gates/gate-config';

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
    private readonly eventStore: EventStoreService,
    private readonly sessionContext: SessionContextService,
    private readonly gitIntegration: GitIntegrationService,
  ) {}

  /**
   * Generate a gate transition message using the Orchestrator agent
   * This replaces hardcoded messages with dynamic, context-aware responses
   */
  private async generateOrchestratorMessage(
    projectId: string,
    userId: string,
    transitionType: 'gate_approved' | 'gate_ready' | 'document_ready',
    context: {
      gateNumber?: number;
      gateType?: string;
      documentTitle?: string;
      nextGate?: string;
    },
  ): Promise<void> {
    // Gather project context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    if (!project) return;

    // Get user's teaching level for appropriate messaging
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { teachingLevel: true },
    });

    // Get current documents to understand project state
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      select: { title: true, documentType: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // Get current gate status
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);

    // Build context for the Orchestrator
    const recentDocs = documents.map((d) => `- ${d.title} (${d.documentType})`).join('\n');
    const teachingLevel = user?.teachingLevel || 'INTERMEDIATE';

    // Check for key documents to make state explicit
    const hasPRD = documents.some((d) => d.title === 'Product Requirements Document');

    let situationDescription: string;
    let taskInstructions: string;

    switch (transitionType) {
      case 'gate_approved':
        situationDescription = `Gate ${context.gateType} has just been APPROVED by the user.`;
        // For G1, give explicit instructions based on whether PRD exists
        if (context.gateNumber === 1) {
          if (hasPRD) {
            taskInstructions = `G1 (Project Scope) is approved. The PRD already exists in the Docs tab.
Tell the user their project scope is approved and the PRD is ready for review.
They should review the PRD in the Docs tab and type "approve" to proceed to G3 (Architecture).
Mention that all project files are visible in the Code tab (recently modified files marked with "M").`;
          } else {
            // PRD doesn't exist yet - it's being auto-created now
            taskInstructions = `G1 (Project Scope) is approved. Now moving to G2 (Product Requirements).
The Product Manager agent is NOW creating the PRD (Product Requirements Document).
Be enthusiastic and action-oriented. Tell them:
- The PRD is being generated right now
- It will include user stories, feature prioritization, and success metrics
- They'll see it appear in the Docs tab shortly
- They can ask questions while waiting
Keep it brief and forward-moving.`;
          }
        } else {
          taskInstructions = `Confirm the gate approval and explain what happens next.
For this gate, explain what the next phase involves and that work is starting automatically.
Mention that all project files are visible in the Code tab (recently modified files marked with "M").`;
        }
        break;

      case 'gate_ready':
        situationDescription = `Gate ${context.gateType} work is COMPLETE and ready for user review.`;
        taskInstructions = `Inform the user that the deliverables are ready for review in the Docs tab.
Explain what they should look for when reviewing.
Tell them to type "approve" when ready to proceed, or ask questions if they need clarification.
Mention that all project files are visible in the Code tab (recently modified files marked with "M").`;
        break;

      case 'document_ready':
        situationDescription = `The "${context.documentTitle}" document has been created/updated.`;
        taskInstructions = `Inform the user the document is ready for review in the Docs tab.
Briefly explain what the document contains and why it's important.
Tell them to type "approve" when ready to proceed, or ask questions if they need clarification.
Mention that all project files are visible in the Code tab (recently modified files marked with "M").`;
        break;
    }

    const prompt = `You are the Project Orchestrator for "${project.name}".

**Situation:** ${situationDescription}

**Current Project State:**
- Current gate: ${currentGate?.gateType || 'Unknown'} (${currentGate?.status || 'Unknown'})
- Project phase: ${project.state?.currentPhase || 'Unknown'}
- Recent documents:
${recentDocs || '  (none yet)'}

**User's Experience Level:** ${teachingLevel}
${teachingLevel === 'NOVICE' ? '(Explain things clearly, be encouraging, avoid jargon)' : ''}
${teachingLevel === 'EXPERT' ? '(Be concise and technical, skip basic explanations)' : ''}

**Your Task:** ${taskInstructions}

Keep your response concise and helpful. Use markdown formatting.`;

    // Execute the Orchestrator agent with streaming
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'ORCHESTRATOR',
        userPrompt: prompt,
        model: undefined, // Use template default
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

          // Emit as a chat message so it appears in the conversation
          // Use a unique message ID based on transition type and timestamp
          const messageId = `orchestrator-${transitionType}-${Date.now()}`;
          this.wsGateway.emitChatMessage(projectId, messageId, response.content);
        },
        onError: (error) => {
          console.error('Orchestrator message generation error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'ORCHESTRATOR',
      'Updating you on progress',
    );
  }

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
    // GATE APPROVAL FLOW (G1-G9)
    // Handles approval for any gate that's in PENDING or IN_REVIEW status
    // ============================================================

    if (isApprovalMessage && currentGate) {
      const gateType = currentGate.gateType;
      const gateNumber = this.extractGateNumber(gateType);

      // G1 requires the intake document to be present
      if (gateNumber === 1 && !intakeDocument) {
        // Don't process G1 approval without intake document
        // Fall through to normal message handling
      } else if (currentGate.status === 'PENDING' || currentGate.status === 'IN_REVIEW') {
        console.log(`Processing gate approval for ${gateType} on project:`, projectId);

        // Store the user's approval message in an agent execution record
        // This ensures it appears in the chat history reconstruction
        const approvalRecord = await this.prisma.agent.create({
          data: {
            projectId,
            agentType: 'ORCHESTRATOR',
            status: 'COMPLETED',
            inputPrompt: `User approval for ${gateType}`,
            model: 'user-input',
            contextData: { userMessage: message },
            outputResult: '', // Will be filled by generateOrchestratorMessage
            completedAt: new Date(),
          },
        });

        // Transition to review if needed
        if (currentGate.status !== 'IN_REVIEW') {
          await this.gateStateMachine.transitionToReview(projectId, gateType, {
            description: `${gateType} ready for approval`,
          });
        }

        // Approve the gate
        await this.gateStateMachine.approveGate(
          projectId,
          gateType,
          userId,
          'approved',
          'User approved via chat',
        );

        // Trigger post-approval processing
        await this.onGateApproved(projectId, gateType, userId);

        // Generate gate-specific confirmation message via Orchestrator agent
        await this.generateOrchestratorMessage(projectId, userId, 'gate_approved', {
          gateNumber,
          gateType,
        });

        return { agentExecutionId: approvalRecord.id, gateApproved: true };
      }
    }

    // ============================================================
    // CHECK FOR STUCK GATES - Auto-retry failed agents
    // If a gate has failed agents and user sends any message, retry
    // ============================================================
    const stuckGate = await this.checkAndRetryStuckGate(projectId, userId);
    if (stuckGate) {
      return {
        agentExecutionId: `retry-${stuckGate}`,
        gateApproved: false,
      };
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
    // allow user to ask questions about the intake via Orchestrator
    // ============================================================
    if (intakeDocument) {
      console.log('Intake exists, G1 not approved - allowing user questions');

      // Use the orchestrator to answer questions about the intake
      return this.handlePreG1Question(projectId, userId, message, intakeDocument.content || '');
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
    // Turn 0 (initial): Welcome message (NO question asked yet, just intro)
    // Turn 1: User confirms ready, agent asks Q1 (Existing Code)
    // Turn 2: User answers Q1, agent asks Q2 (Technical Background)
    // Turn 3: User answers Q2, agent asks Q3 (Success Criteria)
    // Turn 4: User answers Q3, agent asks Q4 (Constraints)
    // Turn 5: User answers Q4, agent asks Q5 (Deployment)
    // Turn 6: User answers Q5, agent outputs intake document
    //
    // So: Turn 0 = 0 questions answered (welcome only)
    //     Turn 1 = 0 questions answered (user just said "ready", Q1 asked)
    //     Turn 2 = 1 question answered (Q1 answered, Q2 asked)
    //     etc.
    //
    // Formula: questionsAnsweredSoFar = max(0, previousExecutions.length - 1)
    // Because turn 0 and turn 1 both have 0 real answers
    const questionsAnsweredSoFar = Math.max(0, previousExecutions.length - 1);
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
          // The document should only be created after user answers all 5 questions
          // questionsAnsweredSoFar is before this response, so after this response we have +1 more
          const hasIntakeDocument = response.content.includes('# Project Intake:');
          const questionsAfterThisResponse = questionsAnsweredSoFar + 1;
          const enoughQuestionsAnswered = questionsAfterThisResponse >= 5; // All 5 questions answered

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
   * Handle user questions about the intake BEFORE G1 is approved
   * Allows users to ask clarifying questions about project classification, etc.
   */
  private async handlePreG1Question(
    projectId: string,
    userId: string,
    message: string,
    intakeContent: string,
  ): Promise<{ agentExecutionId: string; gateApproved: boolean }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    // Build the prompt for the orchestrator to answer intake questions
    const userPrompt = `You are the Project Orchestrator for "${project?.name}".

The user has completed the intake interview and a **Project Intake document** has been created.
The intake is waiting for G1 approval, but the user has a question first.

**Current State:**
- Project Intake document is ready
- G1 (Scope Approval) is PENDING - user has NOT approved yet
- User is asking a question before approving

**Project Intake Document:**
${intakeContent.substring(0, 3000)}

**User's Question:**
"${message}"

**Your Task:**
1. Answer their question helpfully and directly
2. Reference specific parts of the intake document when relevant
3. If they're asking about project classification (traditional vs ai_ml), explain the reasoning
4. After answering, remind them they can type **"approve"** when ready to proceed, or ask more questions

Keep your response concise and helpful. Don't be pushy about approval.`;

    // Execute the orchestrator agent
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
        },
        onError: (error) => {
          console.error('Pre-G1 question error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'ORCHESTRATOR',
      'Answering your question',
    );

    return { agentExecutionId, gateApproved: false };
  }

  /**
   * Handle user messages after G1 is approved
   * Dynamically detects current gate and builds appropriate context
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

    // Get the ACTUAL current gate dynamically
    const currentGate = await this.gateStateMachine.getCurrentGate(projectId);
    const currentGateType = currentGate?.gateType || 'G2_PENDING';
    const currentGateNumber = this.extractGateNumber(currentGateType);

    console.log(
      `[handlePostG1Message] Current gate: ${currentGateType}, status: ${currentGate?.status}`,
    );

    // Get relevant documents for context
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      select: { title: true, documentType: true, content: true },
    });

    const prdDoc = documents.find((d) => d.title === 'Product Requirements Document');
    const archDoc = documents.find(
      (d) =>
        d.title === 'System Architecture' ||
        d.title === 'System Architecture Document' ||
        d.documentType === 'ARCHITECTURE',
    );
    const designDoc = documents.find(
      (d) => d.title === 'Design System Document' || d.title === 'Design System',
    );

    const projectContext = intakeDocument?.content || project?.name || 'the project';

    // Check if any agent is currently running for this project
    const runningAgent = await this.prisma.agent.findFirst({
      where: { projectId, status: 'RUNNING' },
    });

    // Check if this is feedback for the current gate's document
    // Only trigger revision if:
    // 1. Gate is IN_REVIEW (document exists)
    // 2. No agents are currently running
    // 3. Message contains feedback
    const isInReview = currentGate?.status === 'IN_REVIEW';
    const hasFeedback = this.isFeedbackMessage(message);
    const hasRelevantDoc =
      (currentGateNumber === 2 && prdDoc) ||
      (currentGateNumber === 3 && archDoc) ||
      (currentGateNumber === 4 && designDoc);

    if (
      isInReview &&
      !runningAgent &&
      hasFeedback &&
      hasRelevantDoc &&
      currentGateNumber >= 2 &&
      currentGateNumber <= 4
    ) {
      console.log(
        `[handlePostG1Message] Detected feedback for G${currentGateNumber} document, triggering revision`,
      );

      // Log feedback to Change Requests document
      await this.logFeedbackToChangeRequests(projectId, currentGateNumber, message, userId);

      // Trigger document revision with the feedback
      const { agentExecutionId } = await this.reviseDocumentWithFeedback(
        projectId,
        userId,
        currentGateType,
        message,
      );

      return { agentExecutionId, gateApproved: false };
    }

    // Build context based on actual current gate
    const { currentStateDescription, userTaskInstructions } = this.buildGateContext(
      currentGateType,
      currentGate?.status || 'PENDING',
      { prdDoc, archDoc, designDoc },
    );

    // Build the prompt for the orchestrator to evaluate the user's intent
    const userPrompt = `You are the Project Orchestrator for "${project?.name}".

**Current Gate:** G${currentGateNumber} - ${this.getGateName(currentGateNumber)}
**Gate Status:** ${currentGate?.status || 'PENDING'}

**Current State:**
${currentStateDescription}

**Project Summary:**
${projectContext.substring(0, 2000)}

**User's Message:**
"${message}"

**Your Task:**
${userTaskInstructions}

Keep your response concise and helpful.`;

    // Execute the agent
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'ORCHESTRATOR',
        userPrompt,
        model: undefined,
        context: { userMessage: message, currentGate: currentGateType },
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
        },
        onError: (error) => {
          console.error('Post-approval message error:', error);
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
   * Revise a document based on user feedback
   * Re-runs the appropriate agent with the feedback incorporated
   */
  private async reviseDocumentWithFeedback(
    projectId: string,
    userId: string,
    gateType: string,
    feedback: string,
  ): Promise<{ agentExecutionId: string }> {
    const gateNumber = this.extractGateNumber(gateType);

    // Map gate to agent type
    const gateToAgent: Record<number, string> = {
      2: 'PRODUCT_MANAGER',
      3: 'ARCHITECT',
      4: 'UX_DESIGNER',
    };

    const agentType = gateToAgent[gateNumber];
    if (!agentType) {
      throw new Error(`No agent configured for revision at gate ${gateType}`);
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new Error('Project not found');
    }

    // Get the existing document to include as context
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        projectId,
        documentType:
          gateNumber === 2 ? 'REQUIREMENTS' : gateNumber === 3 ? 'ARCHITECTURE' : 'OTHER',
        title: { not: 'Project Intake' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get handoff context
    const handoffContext = await this.getHandoffContext(projectId, gateType);

    // Build revision prompt with feedback
    const revisionPrompt = `You are revising the existing document based on user feedback.

**EXISTING DOCUMENT:**
${existingDoc?.content || 'No existing document found'}

**USER FEEDBACK:**
${feedback}

**INSTRUCTIONS:**
1. Review the existing document above
2. Incorporate ALL the user's feedback into a revised version
3. Maintain the same structure and format
4. Output the COMPLETE revised document (not just the changes)

**CONTEXT:**
${handoffContext}

Generate the complete revised document now.`;

    console.log(`[WorkflowCoordinator] Revising ${agentType} document with user feedback`);

    // Emit a message to let the user know we're revising
    const messageId = `revision-${gateType}-${Date.now()}`;
    this.wsGateway.emitChatMessage(
      projectId,
      messageId,
      `I'm updating the ${gateNumber === 2 ? 'PRD' : gateNumber === 3 ? 'Architecture' : 'Design'} document based on your feedback. This will just take a moment...`,
    );

    // Execute the agent with revision prompt
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType,
        userPrompt: revisionPrompt,
        model: undefined,
        context: { revision: true, feedback },
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

          // Log the revision
          await this.eventStore.appendEvent(projectId, {
            type: 'DocumentRevised',
            data: {
              agentType,
              gateType,
              feedback: feedback.substring(0, 500),
            },
            userId,
          });

          // Emit completion message
          const completionMessageId = `revision-complete-${Date.now()}`;
          this.wsGateway.emitChatMessage(
            projectId,
            completionMessageId,
            `The ${gateNumber === 2 ? 'PRD' : gateNumber === 3 ? 'Architecture' : 'Design'} document has been updated with your feedback. Please review it in the Docs tab.\n\nIf you're satisfied with the changes, type **"approve"** to proceed to the next gate. Otherwise, feel free to provide more feedback.`,
          );
        },
        onError: (error) => {
          console.error('Document revision error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      agentType,
      `Revising document with feedback`,
    );

    return { agentExecutionId };
  }

  /**
   * Log feedback to database (structured) and Change Requests document (human-readable)
   */
  private async logFeedbackToChangeRequests(
    projectId: string,
    gateNumber: number,
    feedback: string,
    userId?: string,
  ): Promise<string> {
    const gateName = this.getGateName(gateNumber);
    const timestamp = new Date().toISOString();
    const gateType = `G${gateNumber}_PENDING`;

    // Determine document type based on gate
    const gateToDocType: Record<number, string> = {
      2: 'REQUIREMENTS',
      3: 'ARCHITECTURE',
      4: 'DESIGN',
    };

    // Determine feedback type based on content analysis
    const feedbackType = this.classifyFeedbackType(feedback);

    // Store in structured UserFeedback table
    const feedbackRecord = await this.prisma.userFeedback.create({
      data: {
        projectId,
        userId,
        gateType,
        gateNumber,
        documentType: gateToDocType[gateNumber] || 'OTHER',
        feedbackType: feedbackType as any,
        content: feedback,
        sentiment: this.analyzeSentiment(feedback) as any,
        actionTaken: 'PENDING',
      },
    });

    console.log(`[WorkflowCoordinator] Created feedback record: ${feedbackRecord.id}`);

    // Also append to Change Requests document for human-readable log
    const changeRequestsDoc = await this.prisma.document.findFirst({
      where: { projectId, title: 'Change Requests' },
    });

    const newEntry = `\n\n## G${gateNumber} - ${gateName} Feedback (${timestamp})\n**Type:** ${feedbackType}\n${feedback}`;

    if (changeRequestsDoc) {
      await this.prisma.document.update({
        where: { id: changeRequestsDoc.id },
        data: {
          content: (changeRequestsDoc.content || '') + newEntry,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.document.create({
        data: {
          projectId,
          title: 'Change Requests',
          documentType: 'OTHER',
          content: `# Change Requests Log\n\nThis document tracks all feedback and change requests made during the project.${newEntry}`,
          version: 1,
          createdById: userId,
        },
      });
    }

    console.log(`[WorkflowCoordinator] Logged feedback for G${gateNumber} to Change Requests`);
    return feedbackRecord.id;
  }

  /**
   * Classify the type of feedback based on content
   */
  private classifyFeedbackType(feedback: string): string {
    const lower = feedback.toLowerCase();

    if (
      lower.includes('change') ||
      lower.includes('update') ||
      lower.includes('modify') ||
      lower.includes('use ') ||
      lower.includes('switch')
    ) {
      return 'CHANGE_REQUEST';
    }
    if (lower.includes('prefer') || lower.includes('would like') || lower.includes('want to')) {
      return 'PREFERENCE';
    }
    if (lower.includes('suggest') || lower.includes('recommend') || lower.includes('consider')) {
      return 'SUGGESTION';
    }
    if (
      lower.includes('?') ||
      lower.includes('what') ||
      lower.includes('how') ||
      lower.includes('why')
    ) {
      return 'QUESTION';
    }
    if (lower.includes('approve') || lower.includes('looks good') || lower.includes('lgtm')) {
      return 'APPROVAL';
    }
    if (
      lower.includes('reject') ||
      lower.includes("don't") ||
      lower.includes('wrong') ||
      lower.includes('incorrect')
    ) {
      return 'REJECTION';
    }
    if (
      lower.includes('bug') ||
      lower.includes('error') ||
      lower.includes('issue') ||
      lower.includes('broken')
    ) {
      return 'BUG_REPORT';
    }
    if (lower.includes('clarify') || lower.includes('explain') || lower.includes('understand')) {
      return 'CLARIFICATION';
    }

    return 'OTHER';
  }

  /**
   * Simple sentiment analysis based on keywords
   */
  private analyzeSentiment(feedback: string): string {
    const lower = feedback.toLowerCase();

    const positiveWords = [
      'good',
      'great',
      'love',
      'like',
      'approve',
      'excellent',
      'perfect',
      'thanks',
      'helpful',
    ];
    const negativeWords = [
      'bad',
      'wrong',
      'incorrect',
      "don't",
      'hate',
      'terrible',
      'issue',
      'problem',
      'bug',
      'error',
    ];

    const positiveCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (positiveCount > negativeCount) return 'POSITIVE';
    if (negativeCount > positiveCount) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  /**
   * Detect if a message contains feedback/revision requests
   */
  private isFeedbackMessage(message: string): boolean {
    const feedbackIndicators = [
      'change',
      'update',
      'modify',
      'revise',
      'edit',
      'use ',
      'switch to',
      'instead',
      'prefer',
      'add ',
      'remove',
      'include',
      "don't",
      'do not',
      'should be',
      'needs to',
      'want to',
      'would like',
      'microservices',
      'docker',
      'railway',
      'vercel',
      'aws',
      'feedback',
      'suggestion',
      'recommendation',
    ];

    const lowerMessage = message.toLowerCase();
    return feedbackIndicators.some((indicator) => lowerMessage.includes(indicator));
  }

  /**
   * Build context description and instructions based on current gate
   */
  private buildGateContext(
    gateType: string,
    gateStatus: string,
    docs: {
      prdDoc?: { content: string | null };
      archDoc?: { content: string | null };
      designDoc?: { content: string | null };
    },
  ): { currentStateDescription: string; userTaskInstructions: string } {
    const gateNumber = this.extractGateNumber(gateType);
    const isInReview = gateStatus === 'IN_REVIEW';

    // G2 - PRD Review
    if (gateNumber === 2) {
      if (docs.prdDoc && isInReview) {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- PRD has been created and is ready for review
- G2 gate status: ${gateStatus}`,
          userTaskInstructions: `Respond to the user's message naturally. You can:
1. Answer questions about the project, PRD, or process
2. If they want to review the PRD, remind them it's in the Docs tab
3. If they want to approve and proceed to G3 (Architecture), they can type "approve"
4. If they have concerns or want changes to the PRD, address them helpfully`,
        };
      } else if (docs.prdDoc) {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- PRD has been created
- Ready for G2 approval`,
          userTaskInstructions: `Respond to the user's message naturally. You can:
1. Answer questions about the project or PRD
2. Remind them the PRD is available in the Docs tab for review
3. If they want to approve, they can type "approve" to proceed to G3 (Architecture)`,
        };
      } else {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- The Product Manager agent is currently creating the PRD
- PRD will appear in the Docs tab when complete`,
          userTaskInstructions: `The PRD is being created. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the document is being created and will be ready shortly
3. Do NOT ask for preferences or feedback - just answer their question briefly
NOTE: Do NOT prompt for feedback while an agent is working.`,
        };
      }
    }

    // G3 - Architecture Review
    if (gateNumber === 3) {
      if (docs.archDoc && isInReview) {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- G2 (PRD) is APPROVED
- Architecture Document has been created and is ready for review
- G3 gate status: ${gateStatus}`,
          userTaskInstructions: `The Architecture document is ready for review. Respond naturally:
1. Answer questions about the architecture, technology choices, or design decisions
2. If they want to review it, remind them it's in the Docs tab
3. If they want to approve and proceed to G4 (Design), they can type "approve"
4. If they provide feedback or want changes, acknowledge it - the document will be updated with their feedback`,
        };
      } else if (docs.archDoc) {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- G2 (PRD) is APPROVED
- Architecture Document has been created
- Ready for G3 approval`,
          userTaskInstructions: `Respond naturally:
1. Answer questions about the architecture
2. Remind them the Architecture document is available in the Docs tab
3. If they want to approve, they can type "approve" to proceed to G4 (Design)
4. If they provide feedback, acknowledge it`,
        };
      } else {
        return {
          currentStateDescription: `- G1 (Scope) is APPROVED
- G2 (PRD) is APPROVED
- The Architect agent is currently designing the system architecture
- Architecture document will appear in the Docs tab when complete`,
          userTaskInstructions: `The Architecture document is being created. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the document is being created and will be ready shortly
3. Do NOT ask for preferences or feedback while the agent is working
NOTE: Do NOT prompt for feedback while an agent is working.`,
        };
      }
    }

    // G4 - Design Review
    if (gateNumber === 4) {
      if (docs.designDoc && isInReview) {
        return {
          currentStateDescription: `- G1-G3 are APPROVED
- Design System Document has been created and is ready for review
- G4 gate status: ${gateStatus}`,
          userTaskInstructions: `The Design document is ready for review. Respond naturally:
1. Answer questions about the UI/UX design or component library
2. If they want to review it, remind them it's in the Docs tab
3. If they want to approve and proceed to G5 (Development), they can type "approve"
4. If they provide feedback, acknowledge it - the document will be updated`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G3 are APPROVED
- The UX Designer agent is currently creating the Design System
- Design document will appear in the Docs tab when complete`,
          userTaskInstructions: `The Design document is being created. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the document is being created and will be ready shortly
3. Do NOT ask for preferences or feedback while the agent is working`,
        };
      }
    }

    // Default for other gates (G5+)
    return {
      currentStateDescription: `- Current gate: G${gateNumber} (${this.getGateName(gateNumber)})
- Gate status: ${gateStatus}`,
      userTaskInstructions: `Respond to the user's message naturally. Answer their questions about the project or current stage.
If they want to approve the current gate, they can type "approve".`,
    };
  }

  /**
   * Start the Product Manager agent to create the PRD for G2
   */
  private async startProductManagerAgent(projectId: string, userId: string): Promise<string> {
    console.log(`[PRD Creation] Starting Product Manager agent for project: ${projectId}`);

    // Guard: Check if PRD already exists (prevent double creation)
    const existingPRD = await this.prisma.document.findFirst({
      where: { projectId, title: 'Product Requirements Document' },
    });
    if (existingPRD) {
      console.log(`[PRD Creation] PRD already exists for project ${projectId}, skipping creation`);
      return 'skipped-prd-exists';
    }

    // Guard: Check if Product Manager is already running for this project
    const runningPM = await this.prisma.agent.findFirst({
      where: {
        projectId,
        agentType: 'PRODUCT_MANAGER',
        status: 'RUNNING',
      },
    });
    if (runningPM) {
      console.log(
        `[PRD Creation] Product Manager already running for project ${projectId}, skipping`,
      );
      return runningPM.id;
    }

    // Get project and intake document for context
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    const intakeDocument = await this.prisma.document.findFirst({
      where: { projectId, title: 'Project Intake' },
    });

    const userPrompt = `Create the PRD for "${project?.name}" based on the following intake document.

**Project Intake:**
${intakeDocument?.content || 'No intake document found'}

Create a single, complete PRD document. Do NOT repeat sections. Output only the PRD in markdown format.`;

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

          // Debug: Log content length and check for obvious duplication
          console.log(`[PRD Debug] Content length: ${response.content.length}`);
          const execSummaryCount = (response.content.match(/Executive Summary/gi) || []).length;
          console.log(`[PRD Debug] "Executive Summary" occurrences: ${execSummaryCount}`);
          if (execSummaryCount > 1) {
            console.warn(
              `[PRD Debug] WARNING: Content appears duplicated ${execSummaryCount} times!`,
            );
          }

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
   * Uses upsert logic to update existing PRD or create new one
   */
  private async savePRDDocument(
    projectId: string,
    userId: string,
    prdContent: string,
  ): Promise<void> {
    console.log(
      `[PRD Save] Saving PRD document for project: ${projectId}, content length: ${prdContent.length}`,
    );

    // Check if PRD already exists (to update instead of creating duplicate)
    const existingPRD = await this.prisma.document.findFirst({
      where: {
        projectId,
        documentType: 'REQUIREMENTS',
        title: 'Product Requirements Document',
      },
    });

    let document;
    if (existingPRD) {
      // Update existing PRD
      document = await this.prisma.document.update({
        where: { id: existingPRD.id },
        data: {
          content: prdContent,
          version: existingPRD.version + 1,
          updatedAt: new Date(),
        },
      });
      console.log(`Updated existing PRD (v${document.version})`);
    } else {
      // Create new PRD
      document = await this.prisma.document.create({
        data: {
          projectId,
          title: 'Product Requirements Document',
          documentType: 'REQUIREMENTS',
          content: prdContent,
          version: 1,
          createdById: userId,
        },
      });
      console.log('Created new PRD document');
    }

    // Notify frontend about new document
    this.wsGateway.emitDocumentCreated(projectId, {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
    });

    // Transition G2 gate to IN_REVIEW
    // Note: G2_PENDING should exist after G1 was approved
    try {
      await this.gateStateMachine.transitionToReview(projectId, 'G2_PENDING', {
        description: 'G2 - Product Requirements Document ready for review',
      });
    } catch (error) {
      console.error('Failed to transition G2 gate:', error);
    }

    // Send notification that PRD is ready via Orchestrator agent
    await this.generateOrchestratorMessage(projectId, userId, 'document_ready', {
      documentTitle: 'Product Requirements Document',
      gateNumber: 2,
      gateType: 'G2_PENDING',
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

    // Check if intake document already exists (to update instead of creating duplicate)
    const existingIntake = await this.prisma.document.findFirst({
      where: {
        projectId,
        documentType: 'REQUIREMENTS',
        title: 'Project Intake',
      },
    });

    let document;
    if (existingIntake) {
      // Update existing intake document
      document = await this.prisma.document.update({
        where: { id: existingIntake.id },
        data: {
          content: intakeContent,
          version: existingIntake.version + 1,
          updatedAt: new Date(),
        },
      });
      console.log(`Updated existing Project Intake (v${document.version})`);
    } else {
      // Create new intake document
      document = await this.prisma.document.create({
        data: {
          projectId,
          title: 'Project Intake',
          documentType: 'REQUIREMENTS',
          content: intakeContent,
          version: 1,
          createdById: userId,
        },
      });
      console.log('Created new Project Intake document');
    }

    // Notify frontend that Project Intake document was created
    this.wsGateway.emitDocumentCreated(projectId, {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
    });

    // Notify user that Project Intake is ready via Orchestrator agent
    await this.generateOrchestratorMessage(projectId, userId, 'document_ready', {
      documentTitle: 'Project Intake',
      gateNumber: 1,
      gateType: 'G1_PENDING',
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

    // Create git checkpoint commit for this gate approval
    // This ensures all work is saved and can be recovered
    await this.createGitCheckpoint(projectId, gateType, userId);

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

          // Query the created documents to get their IDs for proper frontend notification
          const documents = await this.prisma.document.findMany({
            where: {
              projectId,
              title: { in: createdDocs },
            },
            select: { id: true, title: true, documentType: true },
          });

          // Notify frontend about new documents with proper IDs
          for (const doc of documents) {
            this.wsGateway.emitDocumentCreated(projectId, {
              id: doc.id,
              title: doc.title,
              documentType: doc.documentType,
            });
          }
        }

        // Auto-start PRD creation after G1 approval (no need for user to type "continue")
        // Check if PRD already exists to avoid re-creating it
        const existingPRD = await this.prisma.document.findFirst({
          where: {
            projectId,
            title: 'Product Requirements Document',
          },
        });

        if (!existingPRD) {
          console.log('Auto-starting PRD creation after G1 approval');

          // Emit agent starting event IMMEDIATELY so user sees feedback in chat
          // Generate a placeholder ID - the real one comes when agent actually starts
          const placeholderAgentId = `prd-starting-${Date.now()}`;
          this.wsGateway.emitAgentStarted(
            projectId,
            placeholderAgentId,
            'PRODUCT_MANAGER',
            'Creating Product Requirements Document',
          );

          // Use setTimeout to allow the G1 approval message to be sent first
          // The agent will emit its own started event with the real ID
          setTimeout(() => {
            this.startProductManagerAgent(projectId, userId).catch((error) => {
              console.error('Failed to auto-start PRD creation:', error);
              // Emit failure so UI can update
              this.wsGateway.emitAgentFailed(projectId, placeholderAgentId, error.message);
            });
          }, 500);
        } else {
          console.log('PRD already exists, skipping auto-creation');
        }
      } else if (gateType === 'G2_PENDING') {
        // G2 (PRD) approved - create post-G2 documents and start G3 (Architecture)
        console.log('G2 approved - creating post-G2 documents and starting G3 agents');

        await this.gateDocuments.initializeGateDocuments(projectId, 'G2', userId, {
          projectName: project.name,
        });

        // Start Architect agent for G3
        await this.executeGateAgents(projectId, 'G3_PENDING', userId);
      } else if (gateType === 'G3_PENDING') {
        // G3 (Architecture) approved - start G4 (Design)
        console.log('G3 approved - starting G4 (Design) agents');
        await this.executeGateAgents(projectId, 'G4_PENDING', userId);
      } else if (gateType === 'G4_PENDING') {
        // G4 (Design) approved - start G5 (Development) with PARALLEL execution
        console.log('G4 approved - starting G5 (Development) agents in PARALLEL');
        await this.executeGateAgents(projectId, 'G5_PENDING', userId);
      } else if (gateType === 'G5_PENDING') {
        // G5 (Development) approved - start G6 (Testing)
        console.log('G5 approved - starting G6 (Testing) agents');
        await this.executeGateAgents(projectId, 'G6_PENDING', userId);
      } else if (gateType === 'G6_PENDING') {
        // G6 (Testing) approved - start G7 (Security)
        console.log('G6 approved - starting G7 (Security) agents');
        await this.executeGateAgents(projectId, 'G7_PENDING', userId);
      } else if (gateType === 'G7_PENDING') {
        // G7 (Security) approved - start G8 (Staging)
        console.log('G7 approved - starting G8 (Staging) agents');
        await this.executeGateAgents(projectId, 'G8_PENDING', userId);
      } else if (gateType === 'G8_PENDING') {
        // G8 (Staging) approved - start G9 (Production)
        console.log('G8 approved - starting G9 (Production) agents');
        await this.executeGateAgents(projectId, 'G9_PENDING', userId);
      } else if (gateType === 'G9_PENDING') {
        // G9 (Production) approved - Project complete!
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
      // Don't fail the gate approval if post-processing fails
    }

    // Try to execute next task (for any remaining tasks)
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

  /**
   * Extract gate number from gate type string (e.g., "G1_PENDING" -> 1)
   */
  private extractGateNumber(gateType: string): number {
    const match = gateType.match(/G(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
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
      console.error(`[WorkflowCoordinator] Project not found: ${projectId}`);
      return;
    }

    const projectType = project.type || 'traditional';

    // Ensure gate exists before executing agents
    // This handles race conditions and recovery from previous failed attempts
    const existingGate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!existingGate) {
      console.log(`[WorkflowCoordinator] Gate ${gateType} doesn't exist, creating it`);
      // Use gateStateMachine to create the gate properly (with deliverables)
      await this.gateStateMachine.ensureGateExists(projectId, gateType);
    }

    // Get agents for this gate based on project type
    const agents = getAgentsForGate(projectType, gateType);

    if (agents.length === 0) {
      console.log(`[WorkflowCoordinator] No agents configured for gate ${gateType}`);
      return;
    }

    console.log(
      `[WorkflowCoordinator] Executing ${agents.length} agent(s) for gate ${gateType}:`,
      agents.join(', '),
    );

    // Get handoff context (shared by all agents)
    const handoffContext = await this.getHandoffContext(projectId, gateType);

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
      console.log(`[WorkflowCoordinator] Starting PARALLEL execution of ${agents.length} agents`);

      // Execute all agents in parallel
      const agentPromises = agents.map((agentType) =>
        this.executeSingleAgent(projectId, agentType, gateType, userId, handoffContext),
      );

      // Wait for all agents to complete
      await Promise.all(agentPromises);
    } else {
      // Sequential execution (single agent)
      for (const agentType of agents) {
        await this.executeSingleAgent(projectId, agentType, gateType, userId, handoffContext);
      }
    }

    // After all agents complete, check if gate can transition
    await this.checkAndTransitionGate(projectId, gateType, userId);
  }

  /**
   * Execute a single agent for a gate
   */
  private async executeSingleAgent(
    projectId: string,
    agentType: string,
    gateType: string,
    userId: string,
    handoffContext: string,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;

    // Get task description for this agent at this gate
    const taskDescription = getAgentTaskDescription(agentType, gateType);

    // Build the agent prompt with handoff context
    const userPrompt = this.buildAgentPrompt(taskDescription, handoffContext, project);

    console.log(`[WorkflowCoordinator] Starting agent ${agentType} for gate ${gateType}`);

    // Log agent start event
    await this.eventStore.appendEvent(projectId, {
      type: 'AgentStarted',
      data: { agentType, gateType, taskDescription },
      userId,
    });

    // Execute the agent with streaming
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType,
        userPrompt,
        model: undefined, // Use template default
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

          // Mark this agent's deliverables complete
          await this.markAgentDeliverablesComplete(projectId, agentType);

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

          console.log(`[WorkflowCoordinator] Agent ${agentType} completed for gate ${gateType}`);
        },
        onError: async (error) => {
          console.error(`[WorkflowCoordinator] Agent ${agentType} error:`, error);
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

          if (isTransientError) {
            const retryCount = await this.getAgentRetryCount(projectId, agentType, gateType);
            if (retryCount < 2) {
              console.log(
                `[WorkflowCoordinator] Auto-retrying ${agentType} (attempt ${retryCount + 1}/2) after transient error`,
              );
              // Wait a bit before retrying
              setTimeout(async () => {
                try {
                  await this.executeSingleAgent(
                    projectId,
                    agentType,
                    gateType,
                    userId,
                    handoffContext,
                  );
                } catch (retryError) {
                  console.error(`[WorkflowCoordinator] Retry failed for ${agentType}:`, retryError);
                }
              }, 3000);
            }
          }
        },
      },
    );

    // Emit agent started event to frontend
    this.wsGateway.emitAgentStarted(projectId, agentExecutionId, agentType, taskDescription);
  }

  /**
   * Build agent prompt with handoff context
   */
  private buildAgentPrompt(
    taskDescription: string,
    handoffContext: string,
    project: { name: string; type: string | null },
  ): string {
    return `## Project: ${project.name}
Project Type: ${project.type || 'traditional'}

## Your Task
${taskDescription}

${handoffContext}

## Instructions
Complete your assigned task based on the project context and previous agent work.
Generate all required deliverables and output them in the appropriate format.
If you need to create documents, use markdown code fences with the document title.`;
  }

  /**
   * Get handoff context from previous agents
   */
  private async getHandoffContext(projectId: string, currentGateType: string): Promise<string> {
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
   * Prioritize documents based on relevance to current gate
   */
  private prioritizeDocumentsForGate(
    documents: { title: string; content: string; documentType: string }[],
    gateType: string,
  ): { title: string; content: string; documentType: string }[] {
    // Define which document types are most relevant for each gate
    const priorities: Record<string, string[]> = {
      G2_PENDING: ['REQUIREMENTS'], // PM needs intake
      G3_PENDING: ['REQUIREMENTS'], // Architect needs PRD
      G4_PENDING: ['ARCHITECTURE', 'REQUIREMENTS'], // Designer needs arch + PRD
      G5_PENDING: ['ARCHITECTURE', 'API_SPEC', 'DATABASE_SCHEMA', 'DESIGN'], // Devs need specs
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
   * Mark deliverables complete for an agent
   */
  private async markAgentDeliverablesComplete(projectId: string, agentType: string): Promise<void> {
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
        `[WorkflowCoordinator] Marked ${result.count} deliverable(s) complete for ${agentType}`,
      );

      // Log event
      await this.eventStore.appendEvent(projectId, {
        type: 'DeliverablesCompleted',
        data: { agentType, count: result.count },
      });
    }
  }

  /**
   * Check if all deliverables are complete and transition gate to review
   */
  private async checkAndTransitionGate(
    projectId: string,
    gateType: string,
    userId: string,
  ): Promise<void> {
    // Get all deliverables for this project
    const deliverables = await this.prisma.deliverable.findMany({
      where: { projectId },
    });

    const incompleteCount = deliverables.filter((d) => d.status !== 'complete').length;
    const totalCount = deliverables.length;

    console.log(
      `[WorkflowCoordinator] Gate ${gateType}: ${totalCount - incompleteCount}/${totalCount} deliverables complete`,
    );

    if (incompleteCount === 0 && totalCount > 0) {
      // All deliverables complete - transition to review
      console.log(
        `[WorkflowCoordinator] All deliverables complete, transitioning ${gateType} to review`,
      );

      await this.gateStateMachine.transitionToReview(projectId, gateType, {
        description: `${gateType} ready for approval - all ${totalCount} deliverables complete`,
      });

      // Get the gate ID for proper frontend notification
      const gate = await this.prisma.gate.findFirst({
        where: { projectId, gateType },
        select: { id: true },
      });

      // Log event
      await this.eventStore.appendEvent(projectId, {
        type: 'GateReadyForReview',
        data: { gateType, gateId: gate?.id, deliverableCount: totalCount },
        userId,
      });

      // Notify frontend via gate ready event (for UI gate approval panel)
      this.wsGateway.emitGateReady(projectId, gate?.id || '', gateType, [
        {
          type: 'deliverables_complete',
          message: `${gateType} is ready for your review and approval.`,
          count: totalCount,
        },
      ]);

      // Also send a chat message for gate-ready notification via Orchestrator agent
      const gateNumber = this.extractGateNumber(gateType);
      await this.generateOrchestratorMessage(projectId, userId, 'gate_ready', {
        gateNumber,
        gateType,
      });
    }
  }

  /**
   * Create a git checkpoint commit after gate approval
   * This ensures all work is committed and tagged for recovery
   */
  private async createGitCheckpoint(
    projectId: string,
    gateType: string,
    userId: string,
  ): Promise<void> {
    try {
      // Get project workspace path
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });

      if (!project) {
        console.log(`[GitCheckpoint] Project not found: ${projectId}`);
        return;
      }

      // Check if there are uncommitted files
      const uncommittedFiles = await this.gitIntegration.getUncommittedFiles(projectId);

      if (uncommittedFiles.length === 0) {
        console.log(`[GitCheckpoint] No uncommitted files for ${gateType}`);
        return;
      }

      console.log(
        `[GitCheckpoint] Creating checkpoint for ${gateType} with ${uncommittedFiles.length} files`,
      );

      // Create the checkpoint commit
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

        // Log event to trust store
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

        // Notify frontend about the checkpoint via agent message
        const checkpointMessage = `**Git Checkpoint Created**\nCommit: \`${commitResult.commitHash?.substring(0, 8)}\`\nFiles: ${uncommittedFiles.length} committed`;
        this.wsGateway.emitAgentChunk(projectId, `git-checkpoint-${gateType}`, checkpointMessage);
        this.wsGateway.emitAgentCompleted(projectId, `git-checkpoint-${gateType}`, {
          content: checkpointMessage,
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'end_turn',
        });
      } else {
        console.error(`[GitCheckpoint] Failed to create checkpoint: ${commitResult.error}`);

        // Log failure event
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

      // Log error event but don't fail the gate approval
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

  /**
   * Get human-readable gate name
   */
  private getGateName(gateNumber: number): string {
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

  /**
   * Check if a gate is stuck (has failed agents) and retry if so
   * Returns the gate type if retry was triggered, null otherwise
   */
  private async checkAndRetryStuckGate(projectId: string, userId: string): Promise<string | null> {
    // Find gates that are PENDING (work should be in progress)
    const pendingGates = await this.prisma.gate.findMany({
      where: {
        projectId,
        status: 'PENDING',
        gateType: { endsWith: '_PENDING' },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const gate of pendingGates) {
      // Check if there are failed agents for this gate with no running agents
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

      // If we have failed agents and nothing running, the gate is stuck
      if (failedAgents.length > 0 && !runningAgents) {
        console.log(
          `[WorkflowCoordinator] Gate ${gate.gateType} is stuck with failed agents, auto-retrying`,
        );

        // Emit a message to let the user know we're retrying
        const messageId = `retry-${gate.gateType}-${Date.now()}`;
        this.wsGateway.emitChatMessage(
          projectId,
          messageId,
          `I noticed the previous attempt failed. Let me retry the ${gate.gateType.replace('_PENDING', '')} work...`,
        );

        // Execute gate agents (retry)
        this.executeGateAgents(projectId, gate.gateType, userId).catch((error) => {
          console.error(`[WorkflowCoordinator] Retry failed for ${gate.gateType}:`, error);
        });

        return gate.gateType;
      }
    }

    return null;
  }

  /**
   * Get retry count for an agent at a specific gate
   * Used to limit auto-retries on transient errors
   */
  private async getAgentRetryCount(
    projectId: string,
    agentType: string,
    gateType: string,
  ): Promise<number> {
    // Count recent failed executions for this agent/gate (within last 10 minutes)
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

  /**
   * Retry failed agents for a gate
   * This is useful when agents fail due to transient errors (e.g., model not found)
   */
  async retryGateAgents(projectId: string, gateType: string, userId: string): Promise<void> {
    console.log(
      `[WorkflowCoordinator] Retrying agents for gate ${gateType} on project ${projectId}`,
    );

    // Verify project exists and user has access
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Execute gate agents (this will start fresh agent executions)
    await this.executeGateAgents(projectId, gateType, userId);
  }
}
