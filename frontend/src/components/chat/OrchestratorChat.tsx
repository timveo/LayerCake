import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/outline';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { workflowApi } from '../../api/workflow';
import { agentsApi } from '../../api/agents';
import { gatesApi } from '../../api/gates';
import { documentsApi } from '../../api/documents';

type ThemeMode = 'dark' | 'light';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isIntakeComplete?: boolean; // Special flag for intake completion message
}

interface AgentStreamEvent {
  agentId: string;
  agentType?: string;
  taskDescription?: string;
  chunk?: string;
  result?: unknown;
  error?: string;
  timestamp: string;
}

interface PendingGateApproval {
  gateNumber: number;
  title: string;
  description: string;
  documentName?: string;
}

interface OrchestratorChatProps {
  theme: ThemeMode;
  isNewProject?: boolean;
  projectName?: string;
  projectId?: string | null;
  onIntakeComplete?: (answers: Record<string, string>) => void;
  // Agent streaming props
  activeAgent?: { agentType: string; taskDescription?: string } | null;
  streamingChunks?: string[];
  isAgentWorking?: boolean;
  agentEvents?: AgentStreamEvent[];
  // Gate approval props
  pendingGateApproval?: PendingGateApproval | null;
  onApproveGate?: () => void;
  onDenyGate?: (reason: string) => void;
  onViewDocument?: (documentName: string) => void;
}

// Helper to detect if message contains a Project Intake document (raw markdown)
// These are hidden since the backend sends a separate summary message
const isIntakeDocument = (content: string): boolean => {
  return (
    content.includes('# Project Intake:') ||
    content.includes('```markdown\n# Project Intake') ||
    content.includes('## Discovery Answers') ||
    (content.includes('## Project Description') && content.includes('### Existing Code'))
  );
};

// Mark intake documents so they can be filtered out from display
const transformMessageForDisplay = (msg: ChatMessage): ChatMessage => {
  if (msg.role === 'assistant' && isIntakeDocument(msg.content)) {
    return { ...msg, isIntakeComplete: true };
  }
  return msg;
};

// Background agents that produce documents (don't show streaming in chat)
const BACKGROUND_AGENTS = [
  'PRODUCT_MANAGER',
  'ARCHITECT',
  'UX_UI_DESIGNER',
  'FRONTEND_DEVELOPER',
  'BACKEND_DEVELOPER',
  'DATABASE_SPECIALIST',
  'DEVOPS_ENGINEER',
  'QA_ENGINEER',
  'SECURITY_SPECIALIST',
  'TECHNICAL_WRITER',
  'ML_ENGINEER',
  'DATA_ENGINEER',
  'ORCHESTRATOR',
];

const isBackgroundAgent = (agentType: string): boolean => {
  return BACKGROUND_AGENTS.includes(agentType);
};

// Get a user-friendly description for background agents
const getBackgroundAgentMessage = (agentType: string): string => {
  const messages: Record<string, string> = {
    'PRODUCT_MANAGER': 'Creating your Product Requirements Document...',
    'ARCHITECT': 'Designing the system architecture...',
    'UX_UI_DESIGNER': 'Creating design mockups...',
    'FRONTEND_DEVELOPER': 'Building the frontend...',
    'BACKEND_DEVELOPER': 'Building the backend...',
    'DATABASE_SPECIALIST': 'Designing the database schema...',
    'DEVOPS_ENGINEER': 'Setting up infrastructure...',
    'QA_ENGINEER': 'Creating test plans...',
    'SECURITY_SPECIALIST': 'Performing security analysis...',
    'TECHNICAL_WRITER': 'Writing documentation...',
    'ML_ENGINEER': 'Building ML components...',
    'DATA_ENGINEER': 'Setting up data pipelines...',
    'ORCHESTRATOR': 'Coordinating project workflow...',
  };
  return messages[agentType] || 'Working on your project...';
};

export const OrchestratorChat: React.FC<OrchestratorChatProps> = ({
  theme,
  isNewProject = false,
  projectName: _projectName,
  projectId,
  onIntakeComplete: _onIntakeComplete,
  activeAgent,
  streamingChunks = [],
  isAgentWorking = false,
  agentEvents = [],
  pendingGateApproval,
  onApproveGate,
  onDenyGate,
  onViewDocument,
}) => {
  const isDark = theme === 'dark';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showDenyInput, setShowDenyInput] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [currentStreamingContent, setCurrentStreamingContent] = useState('');

  // Track if we've fetched and displayed the agent's initial response
  const hasFetchedInitialResponse = useRef(false);

  // Initialize with a simple system message only when projectId changes
  // Don't reset if we've already loaded history
  useEffect(() => {
    if (hasFetchedInitialResponse.current) return; // Don't reset if history loaded

    const systemMessage: ChatMessage = {
      id: 'system-init',
      role: 'system',
      content: isNewProject
        ? 'Starting project discovery...'
        : 'Loading conversation...',
      timestamp: new Date(),
    };
    setMessages([systemMessage]);
  }, [projectId, isNewProject]);

  // Listen for special agent events (onboarding-complete, g1-approved, guidance)
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    // Special event IDs that send messages directly from the backend
    const specialEventIds = ['onboarding-complete', 'g1-approved', 'guidance'];

    for (const eventId of specialEventIds) {
      const event = agentEvents.find(
        (e: AgentStreamEvent) => e.agentId === eventId && e.result
      );

      if (event && event.result) {
        const result = event.result as { content?: string };
        if (result.content) {
          const messageId = `special-${eventId}`;
          setMessages((prev) => {
            // Don't add if we already have this message
            if (prev.some((m) => m.id === messageId)) return prev;
            return [...prev, {
              id: messageId,
              role: 'assistant' as const,
              content: result.content!,
              timestamp: new Date(),
            }];
          });
        }
      }
    }
  }, [agentEvents]);

  // Fetch full conversation history from agent executions
  // This restores the chat state when returning to a project
  useEffect(() => {
    if (!projectId) return;

    // Reset for new project
    hasFetchedInitialResponse.current = false;

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 20; // Poll for up to 20 seconds

    const fetchAgentHistory = async () => {
      if (cancelled || hasFetchedInitialResponse.current) return;

      try {
        // Fetch history, documents, and gates in parallel
        const [history, documents, gates] = await Promise.all([
          agentsApi.getHistory(projectId),
          documentsApi.list(projectId).catch(() => []),
          gatesApi.list(projectId).catch(() => []),
        ]);

        // Get all COMPLETED onboarding executions with results
        const completedOnboarding = history.filter(
          exec => exec.agentType === 'PRODUCT_MANAGER_ONBOARDING' &&
                  exec.status === 'COMPLETED' &&
                  exec.outputResult
        );

        if (completedOnboarding.length > 0 && !cancelled) {
          hasFetchedInitialResponse.current = true;

          // Build full conversation history from all executions
          const historyMessages: ChatMessage[] = [];

          for (const exec of completedOnboarding) {
            // Extract user message from contextData if available
            const contextData = exec.contextData as { userMessage?: string } | null;
            if (contextData?.userMessage) {
              historyMessages.push({
                id: `user-${exec.id}`,
                role: 'user' as const,
                content: contextData.userMessage,
                timestamp: new Date(exec.createdAt),
              });
            }

            // Add assistant response (always add if outputResult exists)
            if (exec.outputResult) {
              historyMessages.push({
                id: `history-${exec.id}`,
                role: 'assistant' as const,
                content: exec.outputResult,
                timestamp: new Date(exec.createdAt),
              });
            }
          }

          // Check if intake document exists - add the approval request message
          const hasIntakeDoc = documents.some(d => d.title === 'Project Intake');
          if (hasIntakeDoc) {
            historyMessages.push({
              id: 'intake-ready',
              role: 'assistant' as const,
              content: `Your **Project Intake** document is ready for review in the Docs tab.\n\nPlease review it and type **"approve"** to proceed, or let me know if you'd like any changes.`,
              timestamp: new Date(),
            });
          }

          // Check if G1 is approved - add the confirmation message
          const g1Gate = gates.find(g => g.gateType === 'G1_PENDING' || g.gateType === 'G1_COMPLETE');
          const isG1Approved = g1Gate?.status === 'APPROVED' || gates.some(g => g.gateType === 'G1_COMPLETE');

          if (isG1Approved) {
            // Remove the intake-ready message since G1 is already approved
            const intakeReadyIndex = historyMessages.findIndex(m => m.id === 'intake-ready');
            if (intakeReadyIndex !== -1) {
              historyMessages.splice(intakeReadyIndex, 1);
            }

            // Add user's approval message and confirmation
            historyMessages.push({
              id: 'user-approval',
              role: 'user' as const,
              content: 'approve',
              timestamp: new Date(),
            });
            historyMessages.push({
              id: 'g1-approved-history',
              role: 'assistant' as const,
              content: `## G1 Approved - Project Scope Confirmed\n\nYour project scope has been approved and tasks have been created for all agents.\n\n**Ready for G2 - Product Requirements**\n\nThe Product Manager agent can now create your **Product Requirements Document (PRD)** which includes:\n- User stories and acceptance criteria\n- Feature prioritization\n- Success metrics\n\nType **"continue"** to start PRD creation, or ask me any questions about the project.`,
              timestamp: new Date(),
            });
          }

          if (historyMessages.length > 0) {
            setMessages(historyMessages);
          }
          return; // Stop polling
        }

        // Keep polling for new projects OR if no history found yet (maybe still loading)
        pollCount++;
        if (pollCount < maxPolls && !cancelled) {
          setTimeout(fetchAgentHistory, 1000);
        }
      } catch (error) {
        console.error('Failed to fetch agent history:', error);
        // Retry on error
        pollCount++;
        if (pollCount < maxPolls && !cancelled) {
          setTimeout(fetchAgentHistory, 1000);
        }
      }
    };

    // Start polling after a short delay
    const timer = setTimeout(fetchAgentHistory, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, isNewProject]);

  // Handle streaming chunks - just display in the streaming bubble, don't add to messages
  // The polling will handle fetching the completed response
  useEffect(() => {
    if (streamingChunks.length > 0) {
      setCurrentStreamingContent(streamingChunks.join(''));
    } else {
      setCurrentStreamingContent('');
    }
  }, [streamingChunks]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingContent]);

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    const messageToSend = input;
    setInput('');
    setIsStreaming(true);

    try {
      // Send message to onboarding agent via API
      const result = await workflowApi.sendOnboardingMessage(projectId, messageToSend);

      // Check if this was a gate approval (handled synchronously, no polling needed)
      if (result.gateApproved) {
        // Gate was approved - the confirmation message comes via WebSocket
        // Just stop streaming state, WebSocket handler will display the message
        setIsStreaming(false);
        return;
      }

      // Poll for the agent's response since WebSocket events may arrive before we're ready
      const pollForResponse = async (executionId: string, attempts = 0): Promise<void> => {
        if (attempts > 30) { // Max 30 seconds
          setIsStreaming(false);
          return;
        }

        try {
          const execution = await agentsApi.getExecution(executionId);
          if (execution.status === 'COMPLETED' && execution.outputResult) {
            // Add the agent's response
            const assistantMessage: ChatMessage = {
              id: `response-${executionId}`,
              role: 'assistant',
              content: execution.outputResult,
              timestamp: new Date(),
            };
            setMessages(prev => {
              // Don't add if we already have this message
              if (prev.some(m => m.id === assistantMessage.id)) return prev;
              return [...prev, assistantMessage];
            });
            setIsStreaming(false);
          } else if (execution.status === 'FAILED') {
            const errorMessage: ChatMessage = {
              id: `error-${executionId}`,
              role: 'system',
              content: execution.outputResult || 'Agent failed to respond.',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
            setIsStreaming(false);
          } else {
            // Still running, poll again
            setTimeout(() => pollForResponse(executionId, attempts + 1), 1000);
          }
        } catch (err) {
          console.error('Poll error:', err);
          setTimeout(() => pollForResponse(executionId, attempts + 1), 1000);
        }
      };

      // Start polling for the response
      pollForResponse(result.agentExecutionId);
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsStreaming(false);
      // Add error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: 'Failed to send message. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Reset streaming state and refocus input when agent finishes
  useEffect(() => {
    if (!isAgentWorking) {
      setIsStreaming(false);
      // Refocus input when agent work completes
      inputRef.current?.focus();
    }
  }, [isAgentWorking]);

  // Refocus input when streaming completes
  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden ${isDark ? 'bg-slate-800/60' : 'bg-white border border-teal-200 shadow-sm'}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-200'}`}>
        <div className="relative">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
            <CpuChipIcon className="w-4 h-4 text-white" />
          </div>
          <motion.div
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ${isDark ? 'border border-slate-800' : 'border border-teal-50'}`}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
        </div>
        <span className={`font-semibold text-xs flex-1 ${isDark ? 'text-white' : 'text-teal-800'}`}>Project Orchestrator</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((rawMsg, i) => {
          const msg = transformMessageForDisplay(rawMsg);
          // Skip rendering raw intake documents - backend sends a separate summary message
          if (msg.isIntakeComplete) {
            return null;
          }
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] px-3 py-2 text-xs leading-relaxed rounded-2xl ${
                msg.role === 'user'
                  ? isDark ? 'bg-teal-950 text-white rounded-br-md' : 'bg-teal-600 text-white rounded-br-md'
                  : msg.role === 'system'
                  ? isDark ? 'bg-slate-700/50 text-teal-200 rounded-bl-md italic' : 'bg-teal-200/50 text-teal-800 rounded-bl-md italic'
                  : isDark ? 'bg-slate-700 text-white rounded-bl-md' : 'bg-white text-teal-900 rounded-bl-md border border-teal-100'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </motion.div>
          );
        })}

        {/* Agent streaming output */}
        {isAgentWorking && activeAgent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl rounded-bl-md max-w-[90%] overflow-hidden ${isDark ? 'bg-slate-700 border border-slate-600' : 'bg-white border border-teal-200'}`}
          >
            {/* Agent header */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-slate-600 bg-slate-700/50' : 'border-teal-100 bg-teal-50'}`}>
              <motion.div
                className={`w-2 h-2 rounded-full bg-emerald-400`}
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className={`text-[10px] font-semibold ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                {activeAgent.agentType.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>working...</span>
            </div>
            {/* Streaming content or background work indicator */}
            <div className={`px-3 py-2 text-xs leading-relaxed ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {isBackgroundAgent(activeAgent.agentType) ? (
                // Background agents: show friendly message, document will appear in Docs tab
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-400' : 'bg-teal-600'}`}
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                        />
                      ))}
                    </div>
                    <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                      {getBackgroundAgentMessage(activeAgent.agentType)}
                    </span>
                  </div>
                  <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    The document will appear in the Docs tab when ready for your review.
                  </p>
                </div>
              ) : currentStreamingContent || streamingChunks.length > 0 ? (
                // Conversational agents: show streaming content
                <div className="whitespace-pre-wrap">
                  {currentStreamingContent || streamingChunks.join('')}
                  <motion.span
                    className={`inline-block w-1.5 h-3 ml-0.5 ${isDark ? 'bg-teal-400' : 'bg-teal-600'}`}
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                </div>
              ) : (
                // Fallback loading state
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-400' : 'bg-teal-600'}`}
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                      />
                    ))}
                  </div>
                  <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                    {activeAgent.taskDescription || 'Starting task...'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {isStreaming && !isAgentWorking && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl rounded-bl-md max-w-[90%] ${isDark ? 'bg-slate-700/50' : 'bg-teal-200/50'}`}>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>Thinking...</span>
          </div>
        )}

        {/* Gate Approval Request */}
        {pendingGateApproval && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl rounded-bl-md overflow-hidden ${isDark ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}
          >
            {/* Header */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-200 bg-amber-100/50'}`}>
              <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-[10px]">
                G{pendingGateApproval.gateNumber}
              </div>
              <div className="flex-1">
                <span className={`text-xs font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                  {pendingGateApproval.title}
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 py-2 space-y-2">
              <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-100' : 'text-amber-900'}`}>
                {pendingGateApproval.description}
              </p>

              {/* View Document Link */}
              {pendingGateApproval.documentName && onViewDocument && (
                <button
                  onClick={() => onViewDocument(pendingGateApproval.documentName!)}
                  className={`text-xs underline ${isDark ? 'text-teal-400 hover:text-teal-300' : 'text-teal-600 hover:text-teal-700'}`}
                >
                  View {pendingGateApproval.documentName}
                </button>
              )}

              {/* Deny reason input */}
              {showDenyInput ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="What changes are needed?"
                    autoFocus
                    className={`w-full px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-700 text-white placeholder-slate-400 border border-slate-600' : 'bg-white text-slate-700 placeholder-slate-400 border border-slate-200'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && denyReason.trim() && onDenyGate) {
                        onDenyGate(denyReason);
                        setShowDenyInput(false);
                        setDenyReason('');
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDenyInput(false); setDenyReason(''); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (denyReason.trim() && onDenyGate) {
                          onDenyGate(denyReason);
                          setShowDenyInput(false);
                          setDenyReason('');
                        }
                      }}
                      disabled={!denyReason.trim()}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        denyReason.trim()
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Submit Feedback
                    </button>
                  </div>
                </div>
              ) : (
                /* Action buttons */
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowDenyInput(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                  >
                    Request Changes
                  </button>
                  <button
                    onClick={onApproveGate}
                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                  >
                    Approve Gate
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-teal-200'}`}>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${isDark ? 'bg-slate-700/50' : 'bg-white border border-teal-200'}`}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your response..."
            disabled={isStreaming || isAgentWorking}
            autoFocus
            className={`flex-1 bg-transparent text-xs focus:outline-none ${isDark ? 'text-white placeholder-teal-300/50' : 'text-teal-900 placeholder-teal-400'} ${(isStreaming || isAgentWorking) ? 'opacity-50' : ''}`}
          />
          {isStreaming || isAgentWorking ? (
            <button onClick={() => setIsStreaming(false)} className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
              <StopIcon className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={handleSend} className={`w-7 h-7 rounded-full text-white flex items-center justify-center ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
              <PaperAirplaneIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrchestratorChat;
