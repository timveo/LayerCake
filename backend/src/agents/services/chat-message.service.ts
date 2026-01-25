import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgentExecutionService } from './agent-execution.service';
import { GateStateMachineService } from '../../gates/services/gate-state-machine.service';
import { AIProviderService } from './ai-provider.service';
import { FeedbackService } from './feedback.service';
import { GateAgentExecutorService } from './gate-agent-executor.service';
import { GateOrchestrationService } from './gate-orchestration.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';

/**
 * ChatMessageService handles AI-generated contextual messages,
 * orchestrator responses, and gate-specific context building.
 *
 * Extracted from WorkflowCoordinatorService for better separation of concerns.
 */
@Injectable()
export class ChatMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentExecution: AgentExecutionService,
    private readonly gateStateMachine: GateStateMachineService,
    private readonly aiProvider: AIProviderService,
    private readonly feedbackService: FeedbackService,
    private readonly gateAgentExecutor: GateAgentExecutorService,
    @Inject(forwardRef(() => GateOrchestrationService))
    private readonly gateOrchestration: GateOrchestrationService,
    @Inject(forwardRef(() => AppWebSocketGateway))
    private readonly wsGateway: AppWebSocketGateway,
  ) {}

  /**
   * Detect if user is asking to retry/rerun an agent
   */
  isRetryRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const retryPatterns = [
      /\b(retry|rerun|re-run|restart|run again|try again|redo)\b/,
      /\b(agent|designer|architect|developer).*(stuck|failed|not working|broken)\b/,
      /\b(stuck|failed|not working|broken).*(agent|designer|architect|developer)\b/,
      /\bstart.*(agent|designer|architect|developer)\b/,
      /\b(kick|trigger|execute).*(agent|designer|architect|developer)\b/,
    ];
    return retryPatterns.some((pattern) => pattern.test(lowerMessage));
  }

  /**
   * Generate a gate transition message using the Orchestrator agent
   * This replaces hardcoded messages with dynamic, context-aware responses
   */
  async generateOrchestratorMessage(
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

Keep your response concise and helpful. Use markdown formatting.
IMPORTANT: Do NOT use <thinking> tags or any internal reasoning. Output only the user-facing message.`;

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
          // Strip <thinking> tags from output - these are internal reasoning
          const cleanContent = response.content
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .trim();

          this.wsGateway.emitAgentCompleted(projectId, agentExecutionId, {
            content: cleanContent,
            usage: response.usage,
            finishReason: response.finishReason,
          });

          // Emit as a chat message so it appears in the conversation
          // Use a unique message ID based on transition type and timestamp
          const messageId = `orchestrator-${transitionType}-${Date.now()}`;
          this.wsGateway.emitChatMessage(projectId, messageId, cleanContent);
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
   * Handle user questions about the intake BEFORE G1 is approved
   * Allows users to ask clarifying questions about project classification, etc.
   */
  async handlePreG1Question(
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
  async handlePostG1Message(
    projectId: string,
    userId: string,
    message: string,
  ): Promise<{ agentExecutionId: string; gateApproved: boolean }> {
    console.log(
      `[ChatMessageService.handlePostG1Message] Received message: "${message.substring(0, 50)}..."`,
    );

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
    const currentGateNumber = this.feedbackService.extractGateNumber(currentGateType);

    console.log(
      `[handlePostG1Message] Current gate: ${currentGateType}, status: ${currentGate?.status}`,
    );

    // Check if user is asking to retry/rerun an agent
    if (this.isRetryRequest(message)) {
      // Check for failed or stuck agents for the current gate
      const failedOrStuckAgents = await this.prisma.agent.findMany({
        where: {
          projectId,
          status: { in: ['FAILED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      // Check if any agent has been running for too long (stuck - more than 5 minutes)
      const stuckAgents = failedOrStuckAgents.filter((agent) => {
        if (agent.status === 'FAILED') return true;
        if (agent.status === 'RUNNING') {
          const runningTime = Date.now() - new Date(agent.createdAt).getTime();
          return runningTime > 5 * 60 * 1000; // 5 minutes
        }
        return false;
      });

      if (stuckAgents.length > 0 || currentGate?.status === 'PENDING') {
        console.log(
          `[handlePostG1Message] Detected retry request. Found ${stuckAgents.length} failed/stuck agents. Retrying gate ${currentGateType}`,
        );

        // Mark stuck agents as failed so they can be retried
        for (const agent of stuckAgents) {
          if (agent.status === 'RUNNING') {
            await this.prisma.agent.update({
              where: { id: agent.id },
              data: { status: 'FAILED' },
            });
          }
        }

        // Trigger the gate retry
        await this.gateOrchestration.retryGateAgents(projectId, currentGateType, userId);

        // Send a confirmation message
        const agentExecutionId = await this.agentExecution.executeAgentStream(
          {
            projectId,
            agentType: 'ORCHESTRATOR',
            userPrompt: `You are the Project Orchestrator. The user asked to retry the agent for gate ${currentGateType}.

I have just triggered a retry of the ${this.feedbackService.getGateName(currentGateNumber)} agent.

Respond with a brief, friendly confirmation that:
1. You understood their request to retry/rerun the agent
2. The agent has been restarted
3. They should see progress shortly

Keep it concise - one short paragraph.`,
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
            },
            onError: (error) => {
              console.error('Retry confirmation error:', error);
              this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
            },
          },
        );

        this.wsGateway.emitAgentStarted(
          projectId,
          agentExecutionId,
          'ORCHESTRATOR',
          'Restarting agent',
        );

        return { agentExecutionId, gateApproved: false };
      }
    }

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
    // G5-G9 document detection (using actual DocumentType enum values)
    // For G5, check if there are build proofs (code exists in workspace, not in documents)
    const g5Proofs = await this.prisma.proofArtifact.findFirst({
      where: { projectId, gate: 'G5_PENDING', proofType: 'build_output' },
    });
    const hasCodeInWorkspace = !!g5Proofs; // If proofs exist, code was generated

    const testDoc = documents.find(
      (d) => d.documentType === 'TEST_PLAN' || d.title === 'Test Plan',
    );
    const securityDoc = documents.find(
      (d) => d.title === 'Security Audit Report' || d.title.includes('Security'),
    );
    const deployDoc = documents.find(
      (d) => d.documentType === 'DEPLOYMENT_GUIDE' || d.title.includes('Deployment'),
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
    const hasFeedback = this.feedbackService.isFeedbackMessage(message);

    // Map gate numbers to their relevant documents/artifacts
    const gateDocMap: Record<number, boolean> = {
      2: !!prdDoc,
      3: !!archDoc,
      4: !!designDoc,
      5: hasCodeInWorkspace, // G5 uses workspace files, not documents
      6: !!testDoc,
      7: !!securityDoc,
      8: !!deployDoc,
      9: !!deployDoc,
    };
    const hasRelevantDoc = gateDocMap[currentGateNumber] ?? false;

    if (
      isInReview &&
      !runningAgent &&
      hasFeedback &&
      hasRelevantDoc &&
      currentGateNumber >= 2 &&
      currentGateNumber <= 9
    ) {
      console.log(
        `[handlePostG1Message] Detected feedback for G${currentGateNumber} document, triggering revision`,
      );

      // Log feedback to Change Requests document
      await this.feedbackService.logFeedbackToChangeRequests(
        projectId,
        currentGateNumber,
        message,
        userId,
      );

      // Trigger document revision with the feedback
      const { agentExecutionId } = await this.feedbackService.reviseDocumentWithFeedback(
        projectId,
        userId,
        currentGateType,
        message,
        (pId, gType) => this.gateAgentExecutor.getHandoffContext(pId, gType),
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

**Current Gate:** G${currentGateNumber} - ${this.feedbackService.getGateName(currentGateNumber)}
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
   * Build context description and instructions based on current gate
   */
  buildGateContext(
    gateType: string,
    gateStatus: string,
    docs: {
      prdDoc?: { content: string | null };
      archDoc?: { content: string | null };
      designDoc?: { content: string | null };
    },
  ): { currentStateDescription: string; userTaskInstructions: string } {
    const gateNumber = this.feedbackService.extractGateNumber(gateType);
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

    // G5 - Development Review
    if (gateNumber === 5) {
      if (isInReview) {
        return {
          currentStateDescription: `- G1-G4 are APPROVED
- Development is COMPLETE and ready for review
- G5 gate status: ${gateStatus}
- Frontend and Backend implementations are ready`,
          userTaskInstructions: `Development is complete and ready for review. Respond naturally:
1. Answer questions about the code implementation, API endpoints, or frontend components
2. If they want to review the code, remind them it's in the Code tab
3. If they want to approve and proceed to G6 (Testing), they can type "approve"
4. If they provide feedback on the code, acknowledge it - changes can be made`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G4 are APPROVED
- Development is in progress (Frontend and Backend developers are working)
- Code will appear in the Code tab as it's generated`,
          userTaskInstructions: `Development is in progress. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the code is being generated and will appear in the Code tab
3. Do NOT ask for preferences or feedback while agents are working`,
        };
      }
    }

    // G6 - Testing Review
    if (gateNumber === 6) {
      if (isInReview) {
        return {
          currentStateDescription: `- G1-G5 are APPROVED
- Testing is COMPLETE and ready for review
- G6 gate status: ${gateStatus}
- Test plan and coverage reports are ready`,
          userTaskInstructions: `Testing is complete and ready for review. Respond naturally:
1. Answer questions about the test plan, test coverage, or specific test cases
2. If they want to review test results, remind them they're in the Docs tab
3. If they want to approve and proceed to G7 (Security), they can type "approve"
4. If they provide feedback on tests, acknowledge it`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G5 are APPROVED
- QA Engineer is creating and executing tests
- Test results will appear in the Docs tab`,
          userTaskInstructions: `Testing is in progress. Keep your response brief:
1. Acknowledge the user's message
2. Let them know tests are being created and will be ready shortly
3. Do NOT ask for preferences while the QA agent is working`,
        };
      }
    }

    // G7 - Security Review
    if (gateNumber === 7) {
      if (isInReview) {
        return {
          currentStateDescription: `- G1-G6 are APPROVED
- Security audit is COMPLETE and ready for review
- G7 gate status: ${gateStatus}
- Security audit report and vulnerability scan are ready`,
          userTaskInstructions: `Security audit is complete and ready for review. Respond naturally:
1. Answer questions about security findings, vulnerabilities, or OWASP compliance
2. If they want to review the security report, remind them it's in the Docs tab
3. If they want to approve and proceed to G8 (Staging), they can type "approve"
4. If they have concerns about security issues, address them`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G6 are APPROVED
- Security Engineer is performing security audit
- Security report will appear in the Docs tab`,
          userTaskInstructions: `Security audit is in progress. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the security audit is being performed
3. Do NOT ask for preferences while the Security agent is working`,
        };
      }
    }

    // G8 - Staging Deployment Review
    if (gateNumber === 8) {
      if (isInReview) {
        return {
          currentStateDescription: `- G1-G7 are APPROVED
- Staging deployment is COMPLETE and ready for review
- G8 gate status: ${gateStatus}
- Application is deployed to staging environment`,
          userTaskInstructions: `Staging deployment is complete and ready for review. Respond naturally:
1. Answer questions about the staging environment, CI/CD pipeline, or infrastructure
2. If they want to review deployment configs, remind them they're in the Code tab
3. If they want to test the staging environment, provide the staging URL if available
4. If they want to approve and proceed to G9 (Production), they can type "approve"`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G7 are APPROVED
- DevOps Engineer is deploying to staging
- Deployment progress will be shown in the logs`,
          userTaskInstructions: `Staging deployment is in progress. Keep your response brief:
1. Acknowledge the user's message
2. Let them know deployment is in progress
3. Do NOT ask for preferences while the DevOps agent is working`,
        };
      }
    }

    // G9 - Production Deployment Review
    if (gateNumber === 9) {
      if (isInReview) {
        return {
          currentStateDescription: `- G1-G8 are APPROVED
- Production deployment is COMPLETE
- G9 gate status: ${gateStatus}
- Application is live in production!`,
          userTaskInstructions: `Production deployment is complete! Respond naturally:
1. Congratulate the user on completing the project!
2. Answer questions about the production environment or monitoring
3. If they want to approve and finalize the project, they can type "approve"
4. Mention that all project artifacts are available in the Docs and Code tabs`,
        };
      } else {
        return {
          currentStateDescription: `- G1-G8 are APPROVED
- DevOps Engineer is deploying to production
- This is the final deployment step`,
          userTaskInstructions: `Production deployment is in progress. Keep your response brief:
1. Acknowledge the user's message
2. Let them know the final deployment is in progress
3. This is an exciting moment - the project is almost complete!`,
        };
      }
    }

    // Default fallback for any unexpected gate
    return {
      currentStateDescription: `- Current gate: G${gateNumber} (${this.feedbackService.getGateName(gateNumber)})
- Gate status: ${gateStatus}`,
      userTaskInstructions: `Respond to the user's message naturally. Answer their questions about the project or current stage.
If they want to approve the current gate, they can type "approve".`,
    };
  }
}
