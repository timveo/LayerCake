import apiClient from '../lib/api-client';

export interface WorkflowStartData {
  projectId: string;
  requirements: string;
}

export interface WorkflowStatus {
  projectId: string;
  currentPhase: string;
  currentGate: string;
  currentAgent: string | null;
  percentComplete: number;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
  };
}

export interface IntakeAnswer {
  questionId: string;
  answer: string;
}

export interface IntakeData {
  projectId: string;
  answers: IntakeAnswer[];
}

export const workflowApi = {
  // Start workflow for a project
  start: async (data: WorkflowStartData): Promise<{ message: string; gateStatus: string }> => {
    const response = await apiClient.post('/agents/workflow/start', data);
    return response.data;
  },

  // Get workflow status
  getStatus: async (projectId: string): Promise<WorkflowStatus> => {
    const response = await apiClient.get(`/agents/workflow/status/${projectId}`);
    return response.data;
  },

  // Submit intake answers (for the 5 questions)
  submitIntake: async (data: IntakeData): Promise<{ message: string }> => {
    const response = await apiClient.post('/agents/workflow/intake', data);
    return response.data;
  },

  // Get next question in intake flow
  getNextQuestion: async (projectId: string): Promise<{
    questionId: string;
    question: string;
    type: 'select' | 'text';
    options?: { value: string; label: string }[];
    prefilled?: string;
  } | null> => {
    const response = await apiClient.get(`/agents/workflow/intake/${projectId}/next`);
    return response.data;
  },

  // Send a message to the onboarding agent (conversational intake)
  sendOnboardingMessage: async (projectId: string, message: string): Promise<{ agentExecutionId: string; gateApproved?: boolean }> => {
    const response = await apiClient.post('/agents/workflow/onboarding-message', {
      projectId,
      message,
    });
    return response.data;
  },
};
