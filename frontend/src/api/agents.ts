import apiClient from '../lib/api-client';
import type { AgentTemplate, AgentExecution } from '../types';

export interface ExecuteAgentData {
  projectId: string;
  agentType: string;
  inputPrompt: string;
  model?: string;
  contextData?: Record<string, unknown>;
}

export const agentsApi = {
  // Get all agent templates
  getTemplates: async (): Promise<AgentTemplate[]> => {
    const response = await apiClient.get<AgentTemplate[]>('/agents/templates');
    return response.data;
  },

  // Get specific agent template
  getTemplate: async (role: string): Promise<AgentTemplate> => {
    const response = await apiClient.get<AgentTemplate>(`/agents/templates/${role}`);
    return response.data;
  },

  // Execute agent
  execute: async (data: ExecuteAgentData): Promise<AgentExecution> => {
    const response = await apiClient.post<AgentExecution>('/agents/execute', data);
    return response.data;
  },

  // Get agent execution history
  getHistory: async (projectId: string): Promise<AgentExecution[]> => {
    const response = await apiClient.get<AgentExecution[]>(`/agents/history?projectId=${projectId}`);
    return response.data;
  },

  // Get execution by ID
  getExecution: async (id: string): Promise<AgentExecution> => {
    const response = await apiClient.get<AgentExecution>(`/agents/executions/${id}`);
    return response.data;
  },
};
