import { Injectable, Logger } from '@nestjs/common';
import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * MetricsService - Prometheus Metrics
 *
 * Custom application metrics:
 * - Agent execution metrics
 * - Gate workflow metrics
 * - Build metrics
 * - Queue metrics
 * - Cost metrics
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // Agent metrics
  readonly agentExecutionDuration = new Histogram({
    name: 'layercake_agent_execution_duration_seconds',
    help: 'Agent execution duration in seconds',
    labelNames: ['agent_type', 'model', 'success'],
    buckets: [1, 5, 10, 30, 60, 120, 300], // 1s to 5min
  });

  readonly agentExecutionTotal = new Counter({
    name: 'layercake_agent_execution_total',
    help: 'Total number of agent executions',
    labelNames: ['agent_type', 'status'],
  });

  readonly agentTokensUsed = new Counter({
    name: 'layercake_agent_tokens_used_total',
    help: 'Total tokens used by agents',
    labelNames: ['agent_type', 'model', 'token_type'],
  });

  readonly agentCost = new Counter({
    name: 'layercake_agent_cost_usd_total',
    help: 'Total cost of agent executions in USD',
    labelNames: ['agent_type', 'model'],
  });

  // Gate metrics
  readonly gateTransitions = new Counter({
    name: 'layercake_gate_transitions_total',
    help: 'Total gate transitions',
    labelNames: ['from_gate', 'to_gate', 'status'],
  });

  readonly gateApprovalDuration = new Histogram({
    name: 'layercake_gate_approval_duration_seconds',
    help: 'Time to approve gates',
    labelNames: ['gate_type'],
    buckets: [60, 300, 900, 1800, 3600, 7200], // 1min to 2hrs
  });

  readonly currentGateStatus = new Gauge({
    name: 'layercake_current_gate_status',
    help: 'Current gate status (0=pending, 1=approved, 2=rejected)',
    labelNames: ['project_id', 'gate_type'],
  });

  // Build metrics
  readonly buildExecutions = new Counter({
    name: 'layercake_build_executions_total',
    help: 'Total build executions',
    labelNames: ['project_type', 'status'],
  });

  readonly buildDuration = new Histogram({
    name: 'layercake_build_duration_seconds',
    help: 'Build execution duration',
    labelNames: ['project_type', 'stage'],
    buckets: [5, 10, 30, 60, 120, 300], // 5s to 5min
  });

  readonly testCoverage = new Gauge({
    name: 'layercake_test_coverage_percentage',
    help: 'Test coverage percentage',
    labelNames: ['project_id'],
  });

  // Queue metrics
  readonly queueDepth = new Gauge({
    name: 'layercake_queue_depth',
    help: 'Number of jobs in queue',
    labelNames: ['priority', 'status'],
  });

  readonly queueProcessingDuration = new Histogram({
    name: 'layercake_queue_processing_duration_seconds',
    help: 'Queue job processing duration',
    labelNames: ['priority', 'agent_type'],
    buckets: [1, 5, 10, 30, 60, 120, 300],
  });

  // Code generation metrics
  readonly filesGenerated = new Counter({
    name: 'layercake_files_generated_total',
    help: 'Total files generated',
    labelNames: ['project_id', 'language'],
  });

  readonly linesGenerated = new Counter({
    name: 'layercake_lines_generated_total',
    help: 'Total lines of code generated',
    labelNames: ['project_id', 'language'],
  });

  // Database metrics
  readonly dbQueryDuration = new Histogram({
    name: 'layercake_db_query_duration_seconds',
    help: 'Database query duration',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  });

  // Error metrics
  readonly errors = new Counter({
    name: 'layercake_errors_total',
    help: 'Total errors',
    labelNames: ['error_type', 'severity'],
  });

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics() {
    register.clear();
  }

  /**
   * Track agent execution
   */
  trackAgentExecution(
    agentType: string,
    model: string,
    durationSeconds: number,
    success: boolean,
    inputTokens: number,
    outputTokens: number,
    cost: number,
  ) {
    this.agentExecutionDuration
      .labels(agentType, model, success.toString())
      .observe(durationSeconds);

    this.agentExecutionTotal
      .labels(agentType, success ? 'success' : 'failed')
      .inc();

    this.agentTokensUsed.labels(agentType, model, 'input').inc(inputTokens);
    this.agentTokensUsed.labels(agentType, model, 'output').inc(outputTokens);

    this.agentCost.labels(agentType, model).inc(cost);
  }

  /**
   * Track gate transition
   */
  trackGateTransition(fromGate: string, toGate: string, status: string) {
    this.gateTransitions.labels(fromGate, toGate, status).inc();
  }

  /**
   * Track build execution
   */
  trackBuild(projectType: string, status: 'success' | 'failed', durationSeconds: number, stage: string) {
    this.buildExecutions.labels(projectType, status).inc();
    this.buildDuration.labels(projectType, stage).observe(durationSeconds);
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(priority: string, status: string, count: number) {
    this.queueDepth.labels(priority, status).set(count);
  }
}
