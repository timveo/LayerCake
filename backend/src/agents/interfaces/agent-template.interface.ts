export type ProjectType = 'traditional' | 'ai_ml' | 'hybrid' | 'enhancement';

export interface AgentHandoffFormat {
  phase: string;
  deliverables: string[];
  nextAgent: string[] | null;
  nextAction: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  version: string;
  projectTypes: ProjectType[];
  gates: string[];
  systemPrompt: string;
  defaultModel: string;
  maxTokens: number;
  handoffFormat: AgentHandoffFormat;
}

export interface AgentExecutionContext {
  projectId: string;
  userId: string;
  currentGate: string;
  currentPhase: string;
  projectState: any;
  availableDocuments: string[];
  taskId?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  output: string;
  documentsCreated?: string[];
  documentsUpdated?: string[];
  tasksCreated?: string[];
  decisionsRecorded?: string[];
  nextAgent?: string;
  gateReady?: boolean;
  errors?: string[];
}

/**
 * Severity levels for post-processing errors
 * - critical: User must be notified, deliverables may be missing
 * - warning: User should be informed, but execution succeeded
 * - info: Non-critical, logged for debugging
 */
export type PostProcessingErrorSeverity = 'critical' | 'warning' | 'info';

/**
 * Individual post-processing error with context
 */
export interface PostProcessingError {
  operation: string;
  message: string;
  severity: PostProcessingErrorSeverity;
  details?: Record<string, unknown>;
}

/**
 * Result of post-processing agent completion
 * Tracks what succeeded and what failed so callers can surface warnings to users
 */
export interface PostProcessingResult {
  success: boolean;
  documentsCreated: string[];
  filesWritten: string[];
  handoffsCreated: string[];
  tasksUpdated: number;
  deliverablesCompleted: number;
  errors: PostProcessingError[];
  /** Errors that should be surfaced to the user */
  criticalErrors: PostProcessingError[];
  /** Errors that are informational only */
  warnings: PostProcessingError[];
}
