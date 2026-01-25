import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgentExecutionService } from './agent-execution.service';
import { EventStoreService } from '../../events/event-store.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { PreviewServerService } from '../../code-generation/preview-server.service';
import { BuildExecutorService } from '../../code-generation/build-executor.service';

/**
 * FeedbackService handles user feedback classification, sentiment analysis,
 * document revisions, and change request logging.
 *
 * Extracted from WorkflowCoordinatorService for better separation of concerns.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentExecution: AgentExecutionService,
    private readonly eventStore: EventStoreService,
    @Inject(forwardRef(() => AppWebSocketGateway))
    private readonly wsGateway: AppWebSocketGateway,
    private readonly previewServer: PreviewServerService,
    private readonly buildExecutor: BuildExecutorService,
  ) {}

  /**
   * Detect if a message contains feedback/revision requests
   */
  isFeedbackMessage(message: string): boolean {
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
      // Bug/issue indicators for code iteration
      "doesn't work",
      'not working',
      'broken',
      'error',
      'bug',
      'fix',
      'issue',
      'problem',
      'wrong',
      'crash',
      'fail',
      'missing',
      // UI/UX iteration
      'color',
      'font',
      'size',
      'layout',
      'position',
      'align',
      'style',
      'look',
      'appearance',
    ];

    const lowerMessage = message.toLowerCase();
    return feedbackIndicators.some((indicator) => lowerMessage.includes(indicator));
  }

  /**
   * Classify the type of feedback based on content
   */
  classifyFeedbackType(feedback: string): string {
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
  analyzeSentiment(feedback: string): string {
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
   * Log feedback to database (structured) and Change Requests document (human-readable)
   */
  async logFeedbackToChangeRequests(
    projectId: string,
    gateNumber: number,
    feedback: string,
    userId?: string,
  ): Promise<string> {
    const gateName = this.getGateName(gateNumber);
    const timestamp = new Date().toISOString();
    const gateType = `G${gateNumber}_PENDING`;

    // Determine document type based on gate (using actual DocumentType enum values)
    const gateToDocType: Record<number, string> = {
      2: 'REQUIREMENTS',
      3: 'ARCHITECTURE',
      4: 'DESIGN',
      5: 'CODE',
      6: 'TEST_PLAN',
      7: 'OTHER', // Security audits stored as OTHER
      8: 'DEPLOYMENT_GUIDE',
      9: 'DEPLOYMENT_GUIDE',
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

    console.log(`[FeedbackService] Created feedback record: ${feedbackRecord.id}`);

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

    console.log(`[FeedbackService] Logged feedback for G${gateNumber} to Change Requests`);
    return feedbackRecord.id;
  }

  /**
   * Revise a document or code based on user feedback
   * Executes the appropriate agent with revision instructions
   */
  async reviseDocumentWithFeedback(
    projectId: string,
    userId: string,
    gateType: string,
    feedback: string,
    getHandoffContext: (projectId: string, gateType: string) => Promise<string>,
  ): Promise<{ agentExecutionId: string }> {
    const gateNumber = this.extractGateNumber(gateType);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new Error('Project not found');
    }

    // For G5 (Development), handle code iteration differently
    if (gateNumber === 5) {
      return this.reviseCodeWithFeedback(projectId, userId, feedback, getHandoffContext);
    }

    // Map gate to agent type
    const gateToAgent: Record<number, string> = {
      2: 'PRODUCT_MANAGER',
      3: 'ARCHITECT',
      4: 'UX_UI_DESIGNER',
      6: 'QA_ENGINEER',
      7: 'SECURITY_ENGINEER',
      8: 'DEVOPS_ENGINEER',
      9: 'DEVOPS_ENGINEER',
    };

    const agentType = gateToAgent[gateNumber];
    if (!agentType) {
      throw new Error(`No agent configured for revision at gate ${gateType}`);
    }

    // Map gate numbers to document types (using actual DocumentType enum values)
    const gateToDocTypeForRevision: Record<number, string> = {
      2: 'REQUIREMENTS',
      3: 'ARCHITECTURE',
      4: 'DESIGN',
      6: 'TEST_PLAN',
      7: 'OTHER', // Security audits
      8: 'DEPLOYMENT_GUIDE',
      9: 'DEPLOYMENT_GUIDE',
    };

    // Get the existing document to include as context
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        projectId,
        documentType: (gateToDocTypeForRevision[gateNumber] || 'OTHER') as any,
        title: { not: 'Project Intake' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Get handoff context via callback to avoid circular dependency
    const handoffContext = await getHandoffContext(projectId, gateType);

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

    console.log(`[FeedbackService] Revising ${agentType} document with user feedback`);

    // Emit a message to let the user know we're revising
    const messageId = `revision-${gateType}-${Date.now()}`;
    const documentName = this.getDocumentNameForGate(gateNumber);
    this.wsGateway.emitChatMessage(
      projectId,
      messageId,
      `I'm updating the ${documentName} based on your feedback. This will just take a moment...`,
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
          const docName = this.getDocumentNameForGate(gateNumber);
          this.wsGateway.emitChatMessage(
            projectId,
            completionMessageId,
            `The ${docName} has been updated with your feedback. Please review it in the Docs tab.\n\nIf you're satisfied with the changes, type **"approve"** to proceed to the next gate. Otherwise, feel free to provide more feedback.`,
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
   * Revise code based on user feedback (G5 iteration)
   * Detects if feedback is for frontend or backend and re-runs the appropriate agent
   */
  private async reviseCodeWithFeedback(
    projectId: string,
    userId: string,
    feedback: string,
    getHandoffContext: (projectId: string, gateType: string) => Promise<string>,
  ): Promise<{ agentExecutionId: string }> {
    const lowerFeedback = feedback.toLowerCase();

    // Detect if feedback is specifically for frontend or backend
    const frontendKeywords = [
      'ui',
      'button',
      'page',
      'component',
      'style',
      'css',
      'layout',
      'frontend',
      'front-end',
      'react',
      'display',
      'screen',
      'form',
      'input',
      'color',
      'font',
      'design',
      'click',
      'hover',
      'animation',
      'responsive',
      'mobile',
    ];
    const backendKeywords = [
      'api',
      'endpoint',
      'database',
      'server',
      'backend',
      'back-end',
      'authentication',
      'auth',
      'login',
      'route',
      'controller',
      'service',
      'prisma',
      'query',
      'data',
      'request',
      'response',
      'error handling',
      'validation',
    ];

    const frontendScore = frontendKeywords.filter((kw) => lowerFeedback.includes(kw)).length;
    const backendScore = backendKeywords.filter((kw) => lowerFeedback.includes(kw)).length;

    // Determine which agent(s) to re-run
    let agentTypes: string[] = [];
    if (frontendScore > backendScore) {
      agentTypes = ['FRONTEND_DEVELOPER'];
    } else if (backendScore > frontendScore) {
      agentTypes = ['BACKEND_DEVELOPER'];
    } else {
      // If unclear, re-run both agents
      agentTypes = ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER'];
    }

    console.log(
      `[FeedbackService] Code iteration - Frontend score: ${frontendScore}, Backend score: ${backendScore}, Running: ${agentTypes.join(', ')}`,
    );

    // Emit a message to let the user know we're iterating
    const messageId = `code-iteration-${Date.now()}`;
    const agentDescription =
      agentTypes.length === 2
        ? 'both frontend and backend developers'
        : agentTypes[0] === 'FRONTEND_DEVELOPER'
          ? 'the frontend developer'
          : 'the backend developer';

    this.wsGateway.emitChatMessage(
      projectId,
      messageId,
      `I'm sending your feedback to ${agentDescription} to update the code. This may take a moment...`,
    );

    // Get handoff context
    const handoffContext = await getHandoffContext(projectId, 'G5_PENDING');

    // Build the iteration prompt
    const iterationPrompt = `You are iterating on existing code based on user feedback.

**USER FEEDBACK:**
${feedback}

**INSTRUCTIONS:**
1. Review the user's feedback carefully
2. Identify the specific changes they are requesting
3. Update the relevant code files to address their feedback
4. Ensure the build still passes after your changes
5. Use write_file() to update files and validate_build() to verify

**IMPORTANT:**
- Focus ONLY on the changes requested in the feedback
- Do not refactor or change code that isn't related to the feedback
- Test your changes to ensure they work
- If the feedback is about a bug, fix the bug and verify the fix

**PROJECT CONTEXT:**
${handoffContext}

Now implement the requested changes.`;

    // Execute the first agent (or both in parallel)
    const firstAgentType = agentTypes[0];
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: firstAgentType,
        userPrompt: iterationPrompt,
        model: undefined,
        context: { iteration: true, feedback },
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

          // Log the iteration
          await this.eventStore.appendEvent(projectId, {
            type: 'CodeIterated',
            data: {
              agentType: firstAgentType,
              feedback: feedback.substring(0, 500),
            },
            userId,
          });

          // If we need to run the second agent (both FE and BE)
          if (agentTypes.length === 2) {
            const secondAgentType = agentTypes[1];
            console.log(`[FeedbackService] Also running ${secondAgentType} for code iteration`);

            const secondExecutionId = await this.agentExecution.executeAgentStream(
              {
                projectId,
                agentType: secondAgentType,
                userPrompt: iterationPrompt,
                model: undefined,
                context: { iteration: true, feedback },
              },
              userId,
              {
                onChunk: (chunk: string) => {
                  this.wsGateway.emitAgentChunk(projectId, secondExecutionId, chunk);
                },
                onComplete: async () => {
                  // Emit final completion message after both agents are done
                  const completionMessageId = `code-iteration-complete-${Date.now()}`;
                  this.wsGateway.emitChatMessage(
                    projectId,
                    completionMessageId,
                    `The code has been updated based on your feedback. Please check the **Code** tab and **Preview** to verify the changes.\n\nIf you're satisfied, type **"approve"** to proceed. Otherwise, let me know what else needs to be changed.`,
                  );
                },
                onError: (error) => {
                  console.error('Second agent iteration error:', error);
                  this.wsGateway.emitAgentFailed(projectId, secondExecutionId, error.message);
                },
              },
            );

            this.wsGateway.emitAgentStarted(
              projectId,
              secondExecutionId,
              secondAgentType,
              `Iterating on code with feedback`,
            );
          } else {
            // Only one agent, emit completion message now
            const completionMessageId = `code-iteration-complete-${Date.now()}`;
            this.wsGateway.emitChatMessage(
              projectId,
              completionMessageId,
              `The code has been updated based on your feedback. Please check the **Code** tab and **Preview** to verify the changes.\n\nIf you're satisfied, type **"approve"** to proceed. Otherwise, let me know what else needs to be changed.`,
            );
          }
        },
        onError: (error) => {
          console.error('Code iteration error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      firstAgentType,
      `Iterating on code with feedback`,
    );

    return { agentExecutionId };
  }

  // ============================================================
  // PREVIEW ERROR DETECTION AND AUTO-FIX
  // ============================================================

  /**
   * Check for preview/build errors and auto-trigger code fixes if needed
   * This is the key integration point for the self-healing loop
   */
  async checkAndFixPreviewErrors(
    projectId: string,
    userId: string,
    getHandoffContext: (projectId: string, gateType: string) => Promise<string>,
  ): Promise<{ triggered: boolean; errors?: string[]; agentExecutionId?: string }> {
    // Check if preview server has failed
    const previewFailed = this.previewServer.hasPreviewFailed(projectId);
    const previewErrors = this.previewServer.getPreviewErrors(projectId);

    // Also check for build errors
    let buildErrors: string[] = [];
    try {
      const buildResult = await this.buildExecutor.runFullValidation(projectId);
      if (!buildResult.overallSuccess) {
        buildErrors = [
          ...buildResult.build.errors,
          ...buildResult.lint.errors,
          ...buildResult.tests.errors,
        ];
      }
    } catch (error) {
      console.log(`[FeedbackService] Could not run build validation: ${error}`);
    }

    const allErrors = [...previewErrors, ...buildErrors];

    if (allErrors.length === 0 && !previewFailed) {
      console.log(`[FeedbackService] No preview/build errors detected for project ${projectId}`);
      return { triggered: false };
    }

    console.log(
      `[FeedbackService] Detected ${allErrors.length} errors for project ${projectId}, triggering auto-fix`,
    );

    // Build error context for the agent
    const errorContext = this.buildPreviewErrorContext(previewErrors, buildErrors, previewFailed);

    // Trigger code revision with error context as "feedback"
    const result = await this.reviseCodeWithPreviewErrors(
      projectId,
      userId,
      errorContext,
      getHandoffContext,
    );

    return {
      triggered: true,
      errors: allErrors,
      agentExecutionId: result.agentExecutionId,
    };
  }

  /**
   * Build a detailed error context string for agent consumption
   */
  private buildPreviewErrorContext(
    previewErrors: string[],
    buildErrors: string[],
    previewFailed: boolean,
  ): string {
    let context = '## Build/Preview Errors Detected\n\n';
    context += 'The generated code has errors that need to be fixed:\n\n';

    if (previewFailed) {
      context += '### Preview Server Status: FAILED\n';
      context += 'The preview server failed to start or crashed.\n\n';
    }

    if (previewErrors.length > 0) {
      context += '### Preview Server Errors\n';
      context += '```\n';
      context += previewErrors.slice(0, 20).join('\n');
      if (previewErrors.length > 20) {
        context += `\n... and ${previewErrors.length - 20} more errors`;
      }
      context += '\n```\n\n';
    }

    if (buildErrors.length > 0) {
      context += '### Build/Lint/Test Errors\n';
      context += '```\n';
      context += buildErrors.slice(0, 20).join('\n');
      if (buildErrors.length > 20) {
        context += `\n... and ${buildErrors.length - 20} more errors`;
      }
      context += '\n```\n\n';
    }

    // Add common fixes hints
    context += '### Common Issues and Fixes\n';
    context += '- **Module not found**: Check if the dependency is in package.json and installed\n';
    context += '- **Cannot find module**: Verify import paths are correct\n';
    context += '- **Type errors**: Check TypeScript types match expected values\n';
    context += '- **Syntax errors**: Review the code for typos or missing brackets\n\n';

    context += '**IMPORTANT**: Fix ALL the errors listed above. Use write_file() to update the ';
    context += 'problematic files and validate_build() to verify your fixes work.\n';

    return context;
  }

  /**
   * Revise code specifically to fix preview/build errors
   * Similar to reviseCodeWithFeedback but optimized for error fixing
   */
  private async reviseCodeWithPreviewErrors(
    projectId: string,
    userId: string,
    errorContext: string,
    getHandoffContext: (projectId: string, gateType: string) => Promise<string>,
  ): Promise<{ agentExecutionId: string }> {
    // Emit a message to let the user know we're fixing errors
    const messageId = `auto-fix-${Date.now()}`;
    this.wsGateway.emitChatMessage(
      projectId,
      messageId,
      `I detected some build/preview errors. Let me fix them automatically...`,
    );

    // Get handoff context
    const handoffContext = await getHandoffContext(projectId, 'G5_PENDING');

    // Build the error-fixing prompt - this is targeted at fixing specific errors
    const fixPrompt = `You are fixing build and preview errors in the generated code.

${errorContext}

**INSTRUCTIONS:**
1. Analyze each error message carefully
2. Identify the root cause of each error
3. Fix ALL the errors - do not leave any unfixed
4. For missing dependencies, add them to package.json AND install them
5. Use write_file() to update files and validate_build() to verify fixes
6. After fixing, restart the preview to verify it works

**PROJECT CONTEXT:**
${handoffContext}

Now fix all the errors listed above. Start with the most critical errors first.`;

    console.log(`[FeedbackService] Auto-fixing errors for project ${projectId}`);

    // Run FRONTEND_DEVELOPER first since most preview errors are frontend-related
    const agentExecutionId = await this.agentExecution.executeAgentStream(
      {
        projectId,
        agentType: 'FRONTEND_DEVELOPER',
        userPrompt: fixPrompt,
        model: undefined,
        context: { autoFix: true, errorContext },
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

          // Log the auto-fix
          await this.eventStore.appendEvent(projectId, {
            type: 'CodeAutoFixed',
            data: {
              agentType: 'FRONTEND_DEVELOPER',
              errorCount: errorContext.split('\n').filter((l) => l.includes('error')).length,
            },
            userId,
          });

          // Emit completion message
          const completionMessageId = `auto-fix-complete-${Date.now()}`;
          this.wsGateway.emitChatMessage(
            projectId,
            completionMessageId,
            `I've attempted to fix the errors. Please check the **Preview** to verify the application works.\n\nIf there are still issues, let me know and I'll continue fixing them.`,
          );
        },
        onError: (error) => {
          console.error('Auto-fix error:', error);
          this.wsGateway.emitAgentFailed(projectId, agentExecutionId, error.message);

          // Emit failure message with guidance
          const failureMessageId = `auto-fix-failed-${Date.now()}`;
          this.wsGateway.emitChatMessage(
            projectId,
            failureMessageId,
            `I encountered an issue while trying to fix the errors. Please describe the problem you're seeing and I'll try a different approach.`,
          );
        },
      },
    );

    this.wsGateway.emitAgentStarted(
      projectId,
      agentExecutionId,
      'FRONTEND_DEVELOPER',
      `Fixing build/preview errors`,
    );

    return { agentExecutionId };
  }

  /**
   * Get current preview and build status for a project
   * Useful for checking if auto-fix is needed
   */
  async getPreviewBuildStatus(projectId: string): Promise<{
    previewRunning: boolean;
    previewFailed: boolean;
    previewErrors: string[];
    buildPassed: boolean;
    buildErrors: string[];
  }> {
    const previewStatus = this.previewServer.getServerStatus(projectId);
    const previewErrors = this.previewServer.getPreviewErrors(projectId);
    const previewFailed = this.previewServer.hasPreviewFailed(projectId);

    let buildPassed = true;
    let buildErrors: string[] = [];

    try {
      const buildResult = await this.buildExecutor.runFullValidation(projectId);
      buildPassed = buildResult.overallSuccess;
      buildErrors = [
        ...buildResult.build.errors,
        ...buildResult.lint.errors,
        ...buildResult.tests.errors,
      ];
    } catch {
      buildPassed = false;
      buildErrors = ['Could not run build validation'];
    }

    return {
      previewRunning: previewStatus?.status === 'running',
      previewFailed,
      previewErrors,
      buildPassed,
      buildErrors,
    };
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Extract gate number from gate type string (e.g., "G2_PENDING" -> 2)
   */
  extractGateNumber(gateType: string): number {
    const match = gateType.match(/G(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get human-readable gate name from gate number
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

  /**
   * Get document name for a gate (used in feedback messages)
   */
  private getDocumentNameForGate(gateNumber: number): string {
    const documentNames: Record<number, string> = {
      2: 'PRD',
      3: 'Architecture document',
      4: 'Design document',
      5: 'code implementation',
      6: 'test plan',
      7: 'security audit',
      8: 'deployment configuration',
      9: 'production deployment',
    };
    return documentNames[gateNumber] || 'document';
  }
}
