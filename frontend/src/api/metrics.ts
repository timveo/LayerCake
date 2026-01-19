import apiClient from '../lib/api-client';

// Types for metrics API responses
export interface ProjectProgress {
  currentGate: number;
  currentPhase: 'plan' | 'dev' | 'ship';
  percentComplete: number;
  completedTasks: number;
  totalTasks: number;
  nextActions: string[];
}

export interface WorkflowStatus {
  projectId: string;
  currentPhase: 'plan' | 'dev' | 'ship';
  currentGate: number;
  activeAgents: AgentStatus[];
  pendingTasks: number;
  completedTasks: number;
}

export interface AgentStatus {
  agentType: string;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  phase: 'plan' | 'dev' | 'ship';
  currentTask?: string;
  lastExecutionAt?: string;
}

export interface ProjectCosts {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalAgentExecutions: number;
  costsByModel: Record<string, number>;
  costsByAgent: Record<string, number>;
}

export interface GateCosts {
  gateType: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  agentBreakdown: {
    agentType: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
  }[];
}

export interface ProjectMetrics {
  projectId: string;
  storiesTotal: number;
  storiesCompleted: number;
  bugsOpen: number;
  bugsResolved: number;
  testCoverage: string;
  qualityGateStatus: 'passing' | 'failing' | 'pending';
  retryCount: number;
}

export interface PhaseHistoryEntry {
  id: string;
  projectId: string;
  phase: string;
  agent: string;
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'skipped' | 'failed';
}

export interface CodeStats {
  totalFiles: number;
  totalLines: number;
  languageBreakdown: {
    language: string;
    files: number;
    lines: number;
    percentage: number;
  }[];
}

export const metricsApi = {
  // Get project progress from orchestrator
  getProjectProgress: async (projectId: string): Promise<ProjectProgress> => {
    const response = await apiClient.get<ProjectProgress>(`/agents/orchestrator/progress/${projectId}`);
    return response.data;
  },

  // Get workflow status including active agents
  getWorkflowStatus: async (projectId: string): Promise<WorkflowStatus> => {
    const response = await apiClient.get<WorkflowStatus>(`/agents/workflow/status/${projectId}`);
    return response.data;
  },

  // Get project costs
  getProjectCosts: async (projectId: string): Promise<ProjectCosts> => {
    const response = await apiClient.get<ProjectCosts>(`/api/costs/project/${projectId}`);
    return response.data;
  },

  // Get costs per gate
  getCostsPerGate: async (projectId: string): Promise<GateCosts[]> => {
    const response = await apiClient.get<GateCosts[]>(`/api/costs/project/${projectId}/per-gate`);
    return response.data;
  },

  // Get project metrics
  getProjectMetrics: async (projectId: string): Promise<ProjectMetrics> => {
    const response = await apiClient.get<ProjectMetrics>(`/api/metrics/${projectId}`);
    return response.data;
  },

  // Calculate and update project metrics
  calculateMetrics: async (projectId: string): Promise<ProjectMetrics> => {
    const response = await apiClient.post<ProjectMetrics>(`/api/metrics/calculate/${projectId}`);
    return response.data;
  },

  // Get phase history for velocity calculations
  getPhaseHistory: async (projectId: string): Promise<PhaseHistoryEntry[]> => {
    const response = await apiClient.get<PhaseHistoryEntry[]>(`/api/phase-history/${projectId}`);
    return response.data;
  },

  // Get current phase
  getCurrentPhase: async (projectId: string): Promise<PhaseHistoryEntry | null> => {
    const response = await apiClient.get<PhaseHistoryEntry | null>(`/api/phase-history/current/${projectId}`);
    return response.data;
  },

  // Get directory tree for code stats
  getDirectoryTree: async (projectId: string): Promise<any> => {
    const response = await apiClient.get(`/api/code-generation/${projectId}/tree`);
    return response.data;
  },

  // Get agent execution history for a project
  getAgentHistory: async (projectId: string): Promise<any[]> => {
    const response = await apiClient.get(`/agents/history?projectId=${projectId}`);
    return response.data;
  },
};
