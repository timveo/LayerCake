import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { PrismaService } from '../common/prisma/prisma.service';
import { PrometheusMetricsService } from '../observability/metrics.service';

export interface AgentJob {
  id: string;
  projectId: string;
  agentType: string;
  taskDescription: string;
  userPrompt: string;
  model: string;
  userId: string;
  inputs?: {
    documents?: string[];
    specifications?: string[];
    context?: any;
  };
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * QueueManagerService - Intelligent Job Distribution
 *
 * Routes jobs to appropriate priority queues based on:
 * - Agent type
 * - Gate blocking status
 * - User tier (Pro/Team get higher priority)
 * - System load
 */
@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);

  constructor(
    @InjectQueue('agents-critical') private criticalQueue: Queue,
    @InjectQueue('agents-high') private highQueue: Queue,
    @InjectQueue('agents-medium') private mediumQueue: Queue,
    @InjectQueue('agents-low') private lowQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly metrics: PrometheusMetricsService,
  ) {}

  /**
   * Add agent job to appropriate queue
   */
  async addAgentJob(job: AgentJob): Promise<Job> {
    const priority = await this.calculatePriority(job);
    const queue = this.getQueueForPriority(priority);

    this.logger.log(`Adding job ${job.id} (${job.agentType}) to ${priority} priority queue`);

    // Add to appropriate queue
    const bullJob = await queue.add(job.agentType, job, {
      jobId: job.id,
      priority: this.getPriorityScore(priority),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    // Track in database
    await this.prisma.agent.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        contextData: {
          queuePriority: priority,
          queuedAt: new Date().toISOString(),
        } as any,
      },
    });

    // Update queue depth metrics
    await this.updateQueueMetrics();

    return bullJob;
  }

  /**
   * Update queue depth metrics
   */
  private async updateQueueMetrics(): Promise<void> {
    const stats = await this.getQueueStats();

    // Update metrics for each priority level
    this.metrics.updateQueueDepth('critical', 'waiting', stats.critical.waiting);
    this.metrics.updateQueueDepth('critical', 'active', stats.critical.active);
    this.metrics.updateQueueDepth('high', 'waiting', stats.high.waiting);
    this.metrics.updateQueueDepth('high', 'active', stats.high.active);
    this.metrics.updateQueueDepth('medium', 'waiting', stats.medium.waiting);
    this.metrics.updateQueueDepth('medium', 'active', stats.medium.active);
    this.metrics.updateQueueDepth('low', 'waiting', stats.low.waiting);
    this.metrics.updateQueueDepth('low', 'active', stats.low.active);
  }

  /**
   * Calculate priority based on agent type and context
   */
  private async calculatePriority(job: AgentJob): Promise<'critical' | 'high' | 'medium' | 'low'> {
    // 1. Orchestrator is always critical
    if (job.agentType === 'ORCHESTRATOR') {
      return 'critical';
    }

    // 2. Gate approvals are critical
    if (job.agentType.includes('approval')) {
      return 'critical';
    }

    // 3. Check if agent is blocking a gate
    const project = await this.prisma.project.findUnique({
      where: { id: job.projectId },
      include: { state: true },
    });

    if (project?.state?.currentGate) {
      // Gate-blocking agents get high priority
      const gateBlockingAgents = [
        'PRODUCT_MANAGER', // G2
        'ARCHITECT', // G3
        'QA_ENGINEER', // G6
        'SECURITY_ENGINEER', // G7
      ];

      if (gateBlockingAgents.includes(job.agentType)) {
        return 'high';
      }
    }

    // 4. Code generation is medium priority
    if (
      ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER', 'ML_ENGINEER', 'DATA_ENGINEER'].includes(
        job.agentType,
      )
    ) {
      return 'medium';
    }

    // 5. Everything else is low priority
    return 'low';
  }

  /**
   * Get queue for priority level
   */
  private getQueueForPriority(priority: 'critical' | 'high' | 'medium' | 'low'): Queue {
    switch (priority) {
      case 'critical':
        return this.criticalQueue;
      case 'high':
        return this.highQueue;
      case 'medium':
        return this.mediumQueue;
      case 'low':
        return this.lowQueue;
    }
  }

  /**
   * Get numeric priority score (lower = higher priority)
   */
  private getPriorityScore(priority: 'critical' | 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'critical':
        return 1;
      case 'high':
        return 2;
      case 'medium':
        return 3;
      case 'low':
        return 4;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    critical: any;
    high: any;
    medium: any;
    low: any;
  }> {
    const [critical, high, medium, low] = await Promise.all([
      this.getQueueStat(this.criticalQueue),
      this.getQueueStat(this.highQueue),
      this.getQueueStat(this.mediumQueue),
      this.getQueueStat(this.lowQueue),
    ]);

    return { critical, high, medium, low };
  }

  /**
   * Get statistics for a single queue
   */
  private async getQueueStat(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Pause all queues (for maintenance)
   */
  async pauseAll(): Promise<void> {
    await Promise.all([
      this.criticalQueue.pause(),
      this.highQueue.pause(),
      this.mediumQueue.pause(),
      this.lowQueue.pause(),
    ]);

    this.logger.warn('All queues paused');
  }

  /**
   * Resume all queues
   */
  async resumeAll(): Promise<void> {
    await Promise.all([
      this.criticalQueue.resume(),
      this.highQueue.resume(),
      this.mediumQueue.resume(),
      this.lowQueue.resume(),
    ]);

    this.logger.log('All queues resumed');
  }

  /**
   * Clear all completed jobs (cleanup)
   */
  async clearCompleted(): Promise<void> {
    await Promise.all([
      this.criticalQueue.clean(24 * 60 * 60 * 1000, 'completed'), // Keep 1 day
      this.highQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      this.mediumQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      this.lowQueue.clean(24 * 60 * 60 * 1000, 'completed'),
    ]);

    this.logger.log('Cleared completed jobs');
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    // Check all queues
    const queues = [this.criticalQueue, this.highQueue, this.mediumQueue, this.lowQueue];

    for (const queue of queues) {
      const job = await queue.getJob(jobId);
      if (job) return job;
    }

    return null;
  }

  /**
   * Cancel job by ID
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);

    if (!job) {
      return false;
    }

    await job.remove();

    // Update database
    await this.prisma.agent.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Cancelled job ${jobId}`);

    return true;
  }
}
