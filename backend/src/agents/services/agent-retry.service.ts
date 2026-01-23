import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AIProviderService } from './ai-provider.service';
import { BuildExecutorService } from '../../code-generation/build-executor.service';
import { CodeParserService } from '../../code-generation/code-parser.service';
import { FileSystemService } from '../../code-generation/filesystem.service';

export interface RetryContext {
  projectId: string;
  agentType: string;
  originalOutput: string;
  errors: string[];
  attemptNumber: number;
  maxAttempts: number;
}

export interface RetryResult {
  success: boolean;
  attemptNumber: number;
  fixedErrors: string[];
  remainingErrors: string[];
  newCode?: string;
}

@Injectable()
export class AgentRetryService {
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(
    private prisma: PrismaService,
    private aiProvider: AIProviderService,
    private buildExecutor: BuildExecutorService,
    private codeParser: CodeParserService,
    private filesystem: FileSystemService,
  ) {}

  /**
   * Retry agent execution with error feedback
   */
  async retryWithErrors(agentExecutionId: string, userId: string): Promise<RetryResult> {
    // Get original agent execution
    const agentExecution = await this.prisma.agent.findUnique({
      where: { id: agentExecutionId },
      include: { project: true },
    });

    if (!agentExecution) {
      throw new Error('Agent execution not found');
    }

    // Get error history for this project (using taskId or recent errors)
    const errors = await this.prisma.errorHistory.findMany({
      where: {
        projectId: agentExecution.projectId,
        resolvedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 10, // Limit to most recent 10 errors
    });

    if (errors.length === 0) {
      return {
        success: true,
        attemptNumber: 0,
        fixedErrors: [],
        remainingErrors: [],
      };
    }

    // Build retry context
    const retryContext: RetryContext = {
      projectId: agentExecution.projectId,
      agentType: agentExecution.agentType,
      originalOutput: agentExecution.outputResult || '',
      errors: errors.map((e) => e.errorMessage),
      attemptNumber: 1,
      maxAttempts: this.MAX_RETRY_ATTEMPTS,
    };

    // Attempt self-healing
    return await this.attemptSelfHealing(retryContext, userId);
  }

  /**
   * Self-healing loop: Ask agent to fix errors, validate, repeat
   */
  private async attemptSelfHealing(context: RetryContext, _userId: string): Promise<RetryResult> {
    const fixedErrors: string[] = [];
    let remainingErrors = [...context.errors];

    for (let attempt = 1; attempt <= context.maxAttempts; attempt++) {
      console.log(
        `[Self-Healing] Attempt ${attempt}/${context.maxAttempts} for ${context.agentType}`,
      );

      // Build self-healing prompt
      const healingPrompt = this.buildSelfHealingPrompt(context, remainingErrors, attempt);

      try {
        // Execute agent with error feedback
        const aiResponse = await this.aiProvider.executePrompt(
          this.getAgentSystemPrompt(context.agentType),
          healingPrompt,
          'claude-sonnet-4-20250514',
        );

        // Extract and write fixed code
        const extractionResult = this.codeParser.extractFiles(aiResponse.content);

        if (extractionResult.files.length === 0) {
          console.log(`[Self-Healing] No code files extracted in attempt ${attempt}`);
          continue;
        }

        // Write fixed files
        for (const file of extractionResult.files) {
          await this.filesystem.writeFile(context.projectId, file.path, file.content);
          console.log(`[Self-Healing] Rewrote file: ${file.path}`);
        }

        // Run validation
        const validationResult = await this.buildExecutor.runFullValidation(context.projectId);

        // Check if errors are fixed
        const newErrors = [
          ...validationResult.build.errors,
          ...validationResult.tests.errors,
          ...validationResult.lint.errors,
        ];

        // Determine which errors were fixed
        const errorCountBefore = remainingErrors.length;
        remainingErrors = newErrors;
        const errorCountAfter = remainingErrors.length;

        if (errorCountAfter < errorCountBefore) {
          const fixedCount = errorCountBefore - errorCountAfter;
          console.log(`[Self-Healing] Fixed ${fixedCount} errors in attempt ${attempt}`);
          fixedErrors.push(...remainingErrors.slice(0, fixedCount).map((e) => e));
        }

        // If all errors fixed, success!
        if (validationResult.overallSuccess) {
          console.log(`[Self-Healing] SUCCESS after ${attempt} attempt(s)! All errors fixed.`);

          // Mark all errors as resolved
          await this.prisma.errorHistory.updateMany({
            where: {
              projectId: context.projectId,
              resolvedAt: null,
            },
            data: {
              resolvedAt: new Date(),
              resolution: `Self-healed by agent after ${attempt} attempts`,
            },
          });

          return {
            success: true,
            attemptNumber: attempt,
            fixedErrors: context.errors,
            remainingErrors: [],
            newCode: aiResponse.content,
          };
        }

        // If no progress, try different approach
        if (errorCountAfter >= errorCountBefore) {
          console.log(
            `[Self-Healing] No progress in attempt ${attempt}. Errors: ${errorCountAfter}`,
          );
        }
      } catch (error) {
        console.error(`[Self-Healing] Error in attempt ${attempt}:`, error);
      }
    }

    // Max attempts reached without full success
    console.log(
      `[Self-Healing] Max attempts (${context.maxAttempts}) reached. ${remainingErrors.length} errors remain.`,
    );

    return {
      success: false,
      attemptNumber: context.maxAttempts,
      fixedErrors,
      remainingErrors,
    };
  }

  /**
   * Build self-healing prompt with error feedback
   */
  private buildSelfHealingPrompt(
    context: RetryContext,
    errors: string[],
    attemptNumber: number,
  ): string {
    return `# Self-Healing Task (Attempt ${attemptNumber}/${context.maxAttempts})

## Context

You previously generated code that has errors. Your task is to **fix the errors** and regenerate the corrected code.

## Original Task

${context.originalOutput.substring(0, 500)}...

## Errors Found (${errors.length} total)

${errors
  .slice(0, 5)
  .map((e, i) => `${i + 1}. ${e}`)
  .join('\n')}

${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}

## Instructions

1. **Analyze each error** - Understand what's wrong
2. **Fix the code** - Regenerate corrected files
3. **Use correct format** - \`\`\`typescript:path/to/file.ts
4. **Include ALL files** - Regenerate every file that needs changes
5. **No placeholders** - Complete, working code only

## Error Categories to Check

- **TypeScript errors**: Missing imports, type mismatches, undefined variables
- **Linting errors**: Code style issues, unused variables
- **Test errors**: Failing test cases, incorrect assertions
- **Build errors**: Missing dependencies, configuration issues

## Output Format

Generate corrected code files using this format:

\`\`\`typescript:src/component.tsx
// Fixed code here
\`\`\`

**Focus on fixing the errors. Generate complete, corrected files.**
`;
  }

  /**
   * Get agent system prompt for retry
   */
  private getAgentSystemPrompt(agentType: string): string {
    // Simplified system prompt for retry context
    return `You are a ${agentType} agent. Your task is to fix code errors and generate corrected code files.

**CRITICAL:** Output code using fence notation with file paths:
\`\`\`typescript:path/to/file.ts
// code here
\`\`\`

Generate complete, working code files. No placeholders or TODOs.`;
  }

  /**
   * Get most recent agent execution ID for a given agent type
   */
  private async getAgentExecutionId(projectId: string, agentType: string): Promise<string> {
    const agent = await this.prisma.agent.findFirst({
      where: {
        projectId,
        agentType,
      },
      orderBy: { createdAt: 'desc' },
    });

    return agent?.id || null;
  }

  /**
   * Automatically trigger retry if build fails after agent execution
   */
  async autoRetryOnBuildFailure(
    projectId: string,
    agentExecutionId: string,
    userId: string,
  ): Promise<boolean> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentExecutionId },
    });

    if (!agent) {
      return false;
    }

    // Only auto-retry for code-generating agents
    const codeGenerationAgents = [
      'FRONTEND_DEVELOPER',
      'BACKEND_DEVELOPER',
      'ML_ENGINEER',
      'DATA_ENGINEER',
    ];

    if (!codeGenerationAgents.includes(agent.agentType)) {
      return false;
    }

    console.log(`[Auto-Retry] Triggering self-healing for ${agent.agentType}...`);

    const retryResult = await this.retryWithErrors(agentExecutionId, userId);

    if (retryResult.success) {
      console.log(`[Auto-Retry] Successfully healed after ${retryResult.attemptNumber} attempts`);

      // Create handoff to QA if development is complete
      if (agent.agentType.includes('developer')) {
        await this.prisma.handoff.create({
          data: {
            projectId,
            fromAgent: agent.agentType,
            toAgent: 'QA_ENGINEER',
            phase: 'development',
            status: 'complete',
            notes: `Code generated and validated. ${retryResult.fixedErrors.length} errors fixed automatically.`,
          },
        });
      }

      return true;
    } else {
      console.log(
        `[Auto-Retry] Failed to heal. ${retryResult.remainingErrors.length} errors remain.`,
      );

      // Create escalation for human review
      await this.prisma.escalation.create({
        data: {
          projectId,
          type: 'technical',
          level: 'L1',
          severity: 'high',
          fromAgent: agent.agentType,
          summary: `Build errors after ${retryResult.attemptNumber} attempts: ${retryResult.remainingErrors.slice(0, 3).join(', ')}`,
          status: 'pending',
        },
      });

      return false;
    }
  }
}
