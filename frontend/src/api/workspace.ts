import apiClient from '../lib/api-client';

// Directory structure from the backend
export interface DirectoryNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
}

export interface FileContent {
  path: string;
  content: string;
}

export const workspaceApi = {
  // Get directory tree for a project workspace
  getTree: async (projectId: string): Promise<DirectoryNode> => {
    const response = await apiClient.get<DirectoryNode>(`/code-generation/${projectId}/tree`);
    return response.data;
  },

  // Read a specific file from the workspace
  readFile: async (projectId: string, filePath: string): Promise<FileContent> => {
    const response = await apiClient.get<FileContent>(`/code-generation/${projectId}/file/${filePath}`);
    return response.data;
  },

  // Create workspace (for initialization)
  createWorkspace: async (projectId: string, projectType?: string): Promise<{ projectId: string; projectPath: string }> => {
    const response = await apiClient.post(`/code-generation/workspace/${projectId}`, { projectType });
    return response.data;
  },

  // Write files to workspace
  writeFiles: async (projectId: string, files: Array<{ path: string; content: string }>): Promise<{ success: boolean; filesWritten: number }> => {
    const response = await apiClient.post(`/code-generation/${projectId}/files`, { files });
    return response.data;
  },

  // Run validation pipeline
  validate: async (projectId: string): Promise<any> => {
    const response = await apiClient.post(`/code-generation/${projectId}/validate`);
    return response.data;
  },

  // ============================================================
  // PREVIEW SERVER
  // ============================================================

  // Start preview server for live app preview
  startPreview: async (projectId: string): Promise<PreviewServerStatus> => {
    const response = await apiClient.post<PreviewServerStatus>(`/code-generation/${projectId}/preview/start`);
    return response.data;
  },

  // Stop preview server
  stopPreview: async (projectId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/code-generation/${projectId}/preview/stop`);
    return response.data;
  },

  // Get preview server status
  getPreviewStatus: async (projectId: string): Promise<PreviewServerStatus> => {
    const response = await apiClient.get<PreviewServerStatus>(`/code-generation/${projectId}/preview/status`);
    return response.data;
  },
};

// Preview server status
export interface PreviewServerStatus {
  running: boolean;
  projectId: string;
  port?: number;
  url?: string;
  status?: 'starting' | 'running' | 'stopped' | 'error';
  startedAt?: string;
  logs?: string[];
}
