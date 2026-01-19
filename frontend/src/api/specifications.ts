import apiClient from '../lib/api-client';
import type { Specification, SpecificationType } from '../types';

export interface CreateSpecificationData {
  projectId: string;
  name: string;
  specificationType: SpecificationType;
  content: Record<string, unknown>;
  description?: string;
  agentId?: string;
  gateId?: string;
  version?: number;
}

export interface UpdateSpecificationData {
  name?: string;
  content?: Record<string, unknown>;
  description?: string;
}

export interface SpecificationStats {
  total: number;
  byType: Record<string, number>;
}

export const specificationsApi = {
  // List specifications by project
  list: async (projectId: string, specificationType?: SpecificationType): Promise<Specification[]> => {
    const params = new URLSearchParams({ projectId });
    if (specificationType) {
      params.append('specificationType', specificationType);
    }
    const response = await apiClient.get<Specification[]>(`/specifications?${params}`);
    return response.data;
  },

  // Get specification by ID
  get: async (id: string): Promise<Specification> => {
    const response = await apiClient.get<Specification>(`/specifications/${id}`);
    return response.data;
  },

  // Create specification
  create: async (data: CreateSpecificationData): Promise<Specification> => {
    const response = await apiClient.post<Specification>('/specifications', data);
    return response.data;
  },

  // Update specification
  update: async (id: string, data: UpdateSpecificationData): Promise<Specification> => {
    const response = await apiClient.patch<Specification>(`/specifications/${id}`, data);
    return response.data;
  },

  // Delete specification
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/specifications/${id}`);
  },

  // Get specifications by agent
  getByAgent: async (agentId: string): Promise<Specification[]> => {
    const response = await apiClient.get<Specification[]>(`/specifications/agent/${agentId}`);
    return response.data;
  },

  // Get specification statistics
  getStats: async (projectId: string): Promise<SpecificationStats> => {
    const response = await apiClient.get<SpecificationStats>(`/specifications/stats/${projectId}`);
    return response.data;
  },
};
