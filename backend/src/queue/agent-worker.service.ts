import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { AgentExecutionService } from '../agents/services/agent-execution.service';
import { AgentJob } from './queue-manager.service';
import { MetricsService } from '../observability/metrics.service';

/**
 * AgentWorkerService - Worker Processes for Agent Execution
 *
 * Runs workers for each priority queue with different concurrency:
 * - Critical: 5 concurrent jobs
 * - High: 3 concurrent jobs
 * - Medium: 2 concurrent jobs
 * - Low: 1 concurrent job
 *
 * This ensures high-priority work is never blocked by low-priority tasks.
 */
@Injectable()
export class AgentWorkerService implements OnModuleInit {
  private readonly logger = new Logger(AgentWorkerService.name);

  constructor(
    @InjectQueue('agents-critical') private criticalQueue: Queue,
    @InjectQueue('agents-high') private highQueue: Queue,
    @InjectQueue('agents-medium') private mediumQueue: Queue,
    @InjectQueue('agents-low') private lowQueue: Queue,
    private readonly agentExecution: AgentExecutionService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    this.logger.log('Agent workers initialized');
    this.logger.log('Critical queue: 5 concurrent workers');
    this.logger.log('High queue: 3 concurrent workers');
    this.logger.log('Medium queue: 2 concurrent workers');
    this.logger.log('Low queue: 1 concurrent worker');
  }

  /**
   * Process critical priority jobs (concurrency: 5)
   */
  @Process({ name: '*', concurrency: 5, queue: 'agents-critical' })
  async processCritical(job: Job<AgentJob>): Promise<any> {
    return this.processAgentJob(job, 'CRITICAL');
  }

  /**
   * Process high priority jobs (concurrency: 3)
   */
  @Process({ name: '*', concurrency: 3, queue: 'agents-high' })
  async processHigh(job: Job<AgentJob>): Promise<any> {
    return this.processAgentJob(job, 'HIGH');
  }

  /**
   * Process medium priority jobs (concurrency: 2)
   */
  @Process({ name: '*', concurrency: 2, queue: 'agents-medium' })
  async processMedium(job: Job<AgentJob>): Promise<any> {
    return this.processAgentJob(job, 'MEDIUM');
  }

  /**
   * Process low priority jobs (concurrency: 1)
   */
  @Process({ name: '*', concurrency: 1, queue: 'agents-low' })
  async processLow(job: Job<AgentJob>): Promise<any> {
    return this.processAgentJob(job, 'LOW');
  }

  /**
   * Process agent job (shared logic)
   */
  private async processAgentJob(job: Job<AgentJob>, priority: string): Promise<any> {
    const startTime = Date.now();

    this.logger.log(
      `[${priority}] Processing job ${job.id} (${job.data.agentType}) - Attempt ${job.attemptsMade + 1}/${job.opts.attempts}`,
    );

    try {
      // Execute agent via AgentExecutionService
      const result = await this.agentExecution.executeAgentWithRetry(
        job.data.projectId,
        job.data.agentType,
        job.data.userPrompt,
        job.data.userId,
        {
          model: job.data.model,
          inputs: job.data.inputs,
        },
      );

      const duration = Date.now() - startTime;

      this.logger.log(
        `[${priority}] Job ${job.id} completed in ${(duration / 1000).toFixed(2)}s`,
      );

      // Update job progress
      await job.progress(100);

      // Track metrics
      this.metrics.trackAgentExecution(
        job.data.agentType,
        job.data.model || 'unknown',
        duration / 1000, // Convert to seconds
        true,
        result.inputTokens || 0,
        result.outputTokens || 0,
        result.cost || 0,
      );

      this.metrics.queueProcessingDuration
        .labels(priority.toLowerCase(), job.data.agentType)
        .observe(duration / 1000);

      return {
        success: true,
        agentId: result.id,
        output: result.outputResult,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        `[${priority}] Job ${job.id} failed after ${(duration / 1000).toFixed(2)}s: ${error.message}`,
      );

      // Update job progress
      await job.progress(0);

      // Track failure metrics
      this.metrics.trackAgentExecution(
        job.data.agentType,
        job.data.model || 'unknown',
        duration / 1000,
        false,
        0,
        0,
        0,
      );

      this.metrics.errors.labels('agent_execution', 'error').inc();

      throw error; // BullMQ will handle retries
    }
  }

  /**
   * Job completed handler
   */
  @Process({ name: 'completed', queue: 'agents-critical' })
  @Process({ name: 'completed', queue: 'agents-high' })
  @Process({ name: 'completed', queue: 'agents-medium' })
  @Process({ name: 'completed', queue: 'agents-low' })
  async onCompleted(job: Job<AgentJob>, result: any): Promise<void> {
    this.logger.log(
      `Job ${job.id} completed successfully - Agent: ${result.agentId}`,
    );
  }

  /**
   * Job failed handler
   */
  @Process({ name: 'failed', queue: 'agents-critical' })
  @Process({ name: 'failed', queue: 'agents-high' })
  @Process({ name: 'failed', queue: 'agents-medium' })
  @Process({ name: 'failed', queue: 'agents-low' })
  async onFailed(job: Job<AgentJob>, error: Error): Promise<void> {
    this.logger.error(
      `Job ${job.id} failed permanently after ${job.attemptsMade} attempts: ${error.message}`,
    );

    // Could send notification, create escalation, etc.
  }
}
