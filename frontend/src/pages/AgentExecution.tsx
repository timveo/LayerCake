import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useWebSocket } from '../hooks/useWebSocket';
import apiClient from '../lib/api-client';
type AgentType =
  | 'PRODUCT_MANAGER'
  | 'ARCHITECT'
  | 'UX_UI_DESIGNER'
  | 'FRONTEND_DEVELOPER'
  | 'BACKEND_DEVELOPER'
  | 'ML_ENGINEER'
  | 'PROMPT_ENGINEER'
  | 'MODEL_EVALUATOR'
  | 'DATA_ENGINEER'
  | 'QA_ENGINEER'
  | 'SECURITY_ENGINEER'
  | 'DEVOPS_ENGINEER'
  | 'AIOPS_ENGINEER'
  | 'ORCHESTRATOR';

interface AgentExecutionData {
  id: string;
  agentType: AgentType;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

export const AgentExecution: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const [taskDescription, setTaskDescription] = useState('');
  const [showOutput, setShowOutput] = useState<string | null>(null);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // WebSocket connection for real-time agent output
  const { isConnected } = useWebSocket(id, {
    onAgentStarted: (event) => {
      console.log('Agent started:', event);
      setCurrentOutput('');
      setIsStreaming(true);
    },
    onAgentChunk: (event) => {
      console.log('Agent chunk received');
      setCurrentOutput((prev) => prev + event.chunk);
      // Auto-scroll to bottom
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    },
    onAgentCompleted: (event) => {
      console.log('Agent completed:', event);
      setIsStreaming(false);
      queryClient.invalidateQueries({ queryKey: ['agent-history', id] });
    },
    onAgentFailed: (event) => {
      console.error('Agent failed:', event);
      setIsStreaming(false);
      setCurrentOutput((prev) => prev + `\n\nERROR: ${event.error}`);
    },
  });

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  });

  // Mock agent executions for now
  const executions: AgentExecutionData[] = [];

  const agents: Array<{ type: AgentType; name: string; icon: string; description: string; gate: string }> = [
    { type: 'PRODUCT_MANAGER', name: 'Product Manager', icon: '📋', description: 'Creates PRD and requirements', gate: 'G1-G2' },
    { type: 'ARCHITECT', name: 'Architect', icon: '🏗️', description: 'Designs system architecture', gate: 'G3' },
    { type: 'UX_UI_DESIGNER', name: 'UX/UI Designer', icon: '🎨', description: 'Creates design system and UI', gate: 'G4' },
    { type: 'FRONTEND_DEVELOPER', name: 'Frontend Developer', icon: '⚛️', description: 'Builds React components', gate: 'G5' },
    { type: 'BACKEND_DEVELOPER', name: 'Backend Developer', icon: '⚙️', description: 'Builds API and services', gate: 'G5' },
    { type: 'ML_ENGINEER', name: 'ML Engineer', icon: '🤖', description: 'Builds ML models and pipelines', gate: 'G5' },
    { type: 'PROMPT_ENGINEER', name: 'Prompt Engineer', icon: '💬', description: 'Optimizes AI prompts', gate: 'G5' },
    { type: 'MODEL_EVALUATOR', name: 'Model Evaluator', icon: '📊', description: 'Evaluates ML model performance', gate: 'G5' },
    { type: 'DATA_ENGINEER', name: 'Data Engineer', icon: '📦', description: 'Builds data pipelines', gate: 'G5' },
    { type: 'QA_ENGINEER', name: 'QA Engineer', icon: '🧪', description: 'Creates and runs tests', gate: 'G6' },
    { type: 'SECURITY_ENGINEER', name: 'Security Engineer', icon: '🔒', description: 'Security audits and fixes', gate: 'G7' },
    { type: 'DEVOPS_ENGINEER', name: 'DevOps Engineer', icon: '🚀', description: 'Deployment and infrastructure', gate: 'G8-G9' },
    { type: 'AIOPS_ENGINEER', name: 'AIOps Engineer', icon: '🔍', description: 'ML ops and monitoring', gate: 'G8-G9' },
    { type: 'ORCHESTRATOR', name: 'Orchestrator', icon: '🎯', description: 'Coordinates all agents', gate: 'All' },
  ];

  const runAgentMutation = useMutation({
    mutationFn: async (data: { agentType: AgentType; taskDescription: string }) => {
      const response = await apiClient.post('/agents/execute-stream', {
        projectId: id,
        agentType: data.agentType,
        userPrompt: data.taskDescription || `Please execute your core responsibilities for this project.`,
      });
      return response.data;
    },
    onSuccess: () => {
      setSelectedAgent(null);
      setTaskDescription('');
    },
    onError: (error: any) => {
      console.error('Failed to run agent:', error);
      setCurrentOutput(`ERROR: ${error.response?.data?.message || 'Failed to start agent'}`);
    },
  });

  const handleRunAgent = () => {
    if (!selectedAgent) return;
    runAgentMutation.mutate({
      agentType: selectedAgent,
      taskDescription,
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      QUEUED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
      RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    };
    return colors[status] || colors.QUEUED;
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary mb-2">
          Agent Execution
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary">
          Run AI agents to build your project - {project?.name}
        </p>
      </div>

      {/* Agent Selection Grid */}
      <Card padding="lg" className="mb-8">
        <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
          Select Agent to Run
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {agents.map((agent) => (
            <button
              key={agent.type}
              onClick={() => setSelectedAgent(agent.type)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedAgent === agent.type
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-light-border dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              <div className="flex items-start gap-3 mb-2">
                <span className="text-3xl">{agent.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-light-text-primary dark:text-dark-text-primary mb-1 truncate">
                    {agent.name}
                  </div>
                  <div className="text-xs text-primary-600 dark:text-primary-400 mb-1">
                    {agent.gate}
                  </div>
                  <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {agent.description}
                  </div>
                </div>
              </div>
              {selectedAgent === agent.type && (
                <div className="flex items-center gap-1 text-primary-500 text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Selected
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Task Description */}
        {selectedAgent && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
                Task Description (Optional)
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe what you want this agent to do, or leave empty for default behavior..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary placeholder-light-text-secondary dark:placeholder-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={handleRunAgent}
                variant="primary"
                size="lg"
                isLoading={runAgentMutation.isPending}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                Run Agent
              </Button>
              <Button
                onClick={() => {
                  setSelectedAgent(null);
                  setTaskDescription('');
                }}
                variant="ghost"
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Real-Time Terminal Output */}
      {(isStreaming || currentOutput) && (
        <Card padding="none" className="mb-8 overflow-hidden">
          {/* Terminal Header */}
          <div className="px-6 py-4 bg-dark-surface dark:bg-dark-elevated border-b border-dark-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm font-mono text-dark-text-secondary">
                LayerCake Agent Terminal
              </span>
            </div>
            <div className="flex items-center gap-4">
              {isConnected ? (
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-medium">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs font-medium">Disconnected</span>
                </div>
              )}
              {isStreaming && (
                <div className="flex items-center gap-2 text-primary-400">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-xs font-medium">Streaming...</span>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Output */}
          <div
            ref={outputRef}
            className="p-6 bg-dark-bg dark:bg-[#0a0f0f] font-mono text-sm text-dark-text-primary overflow-y-auto"
            style={{ maxHeight: '600px', minHeight: '300px' }}
          >
            {currentOutput ? (
              <pre className="whitespace-pre-wrap break-words leading-relaxed text-primary-100">
                {currentOutput}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-dark-text-secondary">
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Waiting for agent to start...</span>
              </div>
            )}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary-400 animate-pulse" />
            )}
          </div>

          {/* Terminal Footer */}
          <div className="px-6 py-3 bg-dark-surface dark:bg-dark-elevated border-t border-dark-border flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-6 text-dark-text-secondary">
              <span>Lines: {currentOutput.split('\n').length}</span>
              <span>Characters: {currentOutput.length}</span>
            </div>
            <Button
              onClick={() => {
                setCurrentOutput('');
                setIsStreaming(false);
              }}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Execution History */}
      <Card padding="lg">
        <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
          Execution History
        </h2>

        {executions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-light-elevated dark:bg-dark-elevated flex items-center justify-center">
              <svg className="w-8 h-8 text-light-text-secondary dark:text-dark-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
              No Executions Yet
            </h3>
            <p className="text-light-text-secondary dark:text-dark-text-secondary mb-4">
              Select an agent above to start building your project
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {agents.find((a) => a.type === execution.agentType)?.icon}
                    </span>
                    <div>
                      <div className="font-semibold text-light-text-primary dark:text-dark-text-primary">
                        {agents.find((a) => a.type === execution.agentType)?.name}
                      </div>
                      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        Started {new Date(execution.startedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(execution.status)}`}>
                      {execution.status}
                    </span>
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {formatDuration(execution.startedAt, execution.completedAt)}
                    </span>
                  </div>
                </div>

                {execution.output && (
                  <div className="mt-3">
                    <Button
                      onClick={() => setShowOutput(showOutput === execution.id ? null : execution.id)}
                      variant="ghost"
                      size="sm"
                    >
                      {showOutput === execution.id ? 'Hide' : 'Show'} Output
                    </Button>
                    {showOutput === execution.id && (
                      <pre className="mt-2 p-4 rounded-lg bg-light-bg dark:bg-dark-bg text-sm text-light-text-primary dark:text-dark-text-primary overflow-x-auto">
                        {execution.output}
                      </pre>
                    )}
                  </div>
                )}

                {execution.error && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="text-sm text-red-800 dark:text-red-200 font-medium mb-1">Error:</div>
                    <div className="text-sm text-red-700 dark:text-red-300">{execution.error}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
