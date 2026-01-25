import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { workflowApi } from '../../api/workflow';
import { agentsApi } from '../../api/agents';
import { gatesApi } from '../../api/gates';
import { projectsApi } from '../../api/projects';

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

interface IncomingChatMessage {
  id: string;
  role: 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface ActiveAgentInfo {
  agentType: string;
  taskDescription?: string;
  startedAt: number;
}

interface OrchestratorChatProps {
  theme: ThemeMode;
  isNewProject?: boolean;
  projectName?: string;
  projectId?: string | null;
  onIntakeComplete?: (answers: Record<string, string>) => void;
  // Agent streaming props - supports multiple parallel agents
  activeAgents?: Map<string, ActiveAgentInfo>;
  streamingChunks?: string[];
  isAgentWorking?: boolean;
  agentEvents?: AgentStreamEvent[];
  // Incoming chat messages from WebSocket
  incomingMessages?: IncomingChatMessage[];
  // Gate approval props
  pendingGateApproval?: PendingGateApproval | null;
  onApproveGate?: () => void;
  onDenyGate?: (reason: string) => void;
  onViewDocument?: (documentName: string) => void;
  // Layout orientation - vertical (left panel) or horizontal (bottom panel like Claude Code)
  orientation?: 'vertical' | 'horizontal';
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

// Helper to detect gate transition messages and extract which gate they refer to
// Returns the gate number if it's a gate transition message, null otherwise
const getGateTransitionNumber = (content: string): number | null => {
  // Patterns for "moving to gate X" or "gate X starting" type messages
  const patterns = [
    /moving to.*gate\s*(\d)/i,
    /gate\s*(\d).*starting/i,
    /entering.*gate\s*(\d)/i,
    /proceeding to.*gate\s*(\d)/i,
    /we're moving to.*gate\s*(\d)/i,
    /transitioning to.*gate\s*(\d)/i,
    /gate\s*(\d)\s*\(requirements\)/i,
    /gate\s*(\d)\s*\(architecture\)/i,
    /gate\s*(\d)\s*\(design\)/i,
    /gate\s*(\d)\s*\(development\)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
};

// Type definition for gate object
interface GateInfo {
  gateType: string;
  status: string;
}

// Check if a gate transition message is stale based on current gate status
// A message about "moving to gate X" is stale if gate X is already APPROVED
const isStaleGateTransition = (content: string, gates: GateInfo[]): boolean => {
  const gateNumber = getGateTransitionNumber(content);
  if (gateNumber === null) return false;

  // Map gate number to gate type
  const gateTypeMap: Record<number, string> = {
    1: 'G1_PENDING',
    2: 'G2_PENDING',
    3: 'G3_PENDING',
    4: 'G4_PENDING',
    5: 'G5_PENDING',
    6: 'G6_PENDING',
    7: 'G7_PENDING',
    8: 'G8_PENDING',
    9: 'G9_PENDING',
  };

  const gateType = gateTypeMap[gateNumber];
  if (!gateType) return false;

  const gate = gates.find(g => g.gateType === gateType);
  // If the gate is APPROVED, this transition message is stale
  return gate?.status === 'APPROVED';
};

// Helper to detect if message contains raw MCP XML tool calls
// These should not be displayed in the chat - they're internal agent operations
const hasMcpToolCalls = (content: string): boolean => {
  return (
    content.includes('<mcp:function_calls>') ||
    content.includes('<mcp:function_result>') ||
    content.includes('<invoke name=') ||
    content.includes('</invoke>')
  );
};

// Simple string similarity check (Jaccard-like)
// Returns a value between 0 and 1
const getSimilarity = (a: string, b: string): number => {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
};

// Mark intake documents so they can be filtered out from display
const transformMessageForDisplay = (msg: ChatMessage): ChatMessage => {
  if (msg.role === 'assistant' && isIntakeDocument(msg.content)) {
    return { ...msg, isIntakeComplete: true };
  }
  return msg;
};

// Background agents that produce documents (don't show streaming in chat)
// All 14 agents except PM_ONBOARDING which has conversation
const BACKGROUND_AGENTS = [
  'PRODUCT_MANAGER',
  'ARCHITECT',
  'UX_UI_DESIGNER',
  'FRONTEND_DEVELOPER',
  'BACKEND_DEVELOPER',
  'DATABASE_SPECIALIST',
  'DEVOPS_ENGINEER',
  'QA_ENGINEER',
  'SECURITY_ENGINEER',
  'SECURITY_SPECIALIST',
  'TECHNICAL_WRITER',
  'ML_ENGINEER',
  'DATA_ENGINEER',
  'PROMPT_ENGINEER',
  'MODEL_EVALUATOR',
  'AIOPS_ENGINEER',
  'ORCHESTRATOR',
];

const isBackgroundAgent = (agentType: string): boolean => {
  return BACKGROUND_AGENTS.includes(agentType);
};

// Agents that produce code (output goes to Code tab, not Docs tab)
const CODE_PRODUCING_AGENTS = ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER', 'DEVOPS_ENGINEER'];

// Get the appropriate output location message based on active agents
const getOutputLocationMessage = (activeAgents: Array<{ agentType: string }>): string => {
  const hasCodeAgent = activeAgents.some(agent => CODE_PRODUCING_AGENTS.includes(agent.agentType));
  const hasDocAgent = activeAgents.some(agent => !CODE_PRODUCING_AGENTS.includes(agent.agentType));

  if (hasCodeAgent && hasDocAgent) {
    return 'Code will appear in the Code tab and documents in the Docs tab when ready.';
  } else if (hasCodeAgent) {
    return 'Code will appear in the Code tab when ready for your review.';
  }
  return 'The document will appear in the Docs tab when ready for your review.';
};

// Get a user-friendly description for background agents
const getBackgroundAgentMessage = (agentType: string): string => {
  const messages: Record<string, string> = {
    'PRODUCT_MANAGER': 'Creating your Product Requirements Document...',
    'ARCHITECT': 'Designing the system architecture and generating specs...',
    'UX_UI_DESIGNER': 'Creating design mockups and design system...',
    'FRONTEND_DEVELOPER': 'Building the frontend from specs...',
    'BACKEND_DEVELOPER': 'Building the backend API from specs...',
    'DATABASE_SPECIALIST': 'Designing the database schema...',
    'DEVOPS_ENGINEER': 'Setting up CI/CD and infrastructure...',
    'QA_ENGINEER': 'Creating test plans and running tests...',
    'SECURITY_ENGINEER': 'Performing OWASP security audit...',
    'SECURITY_SPECIALIST': 'Performing security analysis...',
    'TECHNICAL_WRITER': 'Writing documentation...',
    'ML_ENGINEER': 'Training and optimizing ML models...',
    'DATA_ENGINEER': 'Building data pipelines and feature store...',
    'PROMPT_ENGINEER': 'Designing and testing prompts for LLM integrations...',
    'MODEL_EVALUATOR': 'Evaluating model performance and benchmarks...',
    'AIOPS_ENGINEER': 'Setting up MLOps pipeline and model serving...',
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
  activeAgents = new Map(),
  streamingChunks = [],
  isAgentWorking = false,
  agentEvents = [],
  incomingMessages = [],
  pendingGateApproval,
  onApproveGate,
  onDenyGate,
  onViewDocument,
  orientation = 'vertical',
}) => {
  const isHorizontal = orientation === 'horizontal';
  // Convert activeAgents Map to array for rendering, sorted by start time
  const activeAgentsList = Array.from(activeAgents.values()).sort((a, b) => a.startedAt - b.startedAt);
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
  // The history loading effect will replace this once data is loaded
  useEffect(() => {
    // Only show loading message, history effect will handle actual content
    const systemMessage: ChatMessage = {
      id: 'system-init',
      role: 'system',
      content: isNewProject
        ? 'Starting project discovery...'
        : 'Loading conversation...',
      timestamp: new Date(),
    };
    // Only set if we don't have messages yet (avoids overwriting loaded history)
    setMessages(prev => prev.length <= 1 ? [systemMessage] : prev);
  }, [projectId, isNewProject]);

  // Listen for special agent events (onboarding-complete, gate approvals, guidance, gate-ready, etc.)
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    // Special event IDs that send messages directly from the backend
    // These include gate-ready events and gate-approved events for all gates
    const specialEventIds = [
      'onboarding-complete',
      'guidance',
      // Gate approval confirmations (G1-G9)
      'g1-approved',
      'g2-approved',
      'g3-approved',
      'g4-approved',
      'g5-approved',
      'g6-approved',
      'g7-approved',
      'g8-approved',
      'g9-approved',
      // Gate ready for review notifications (G2-G9)
      'g2-ready',
      'g3-ready',
      'g4-ready',
      'g5-ready',
      'g6-ready',
      'g7-ready',
      'g8-ready',
      'g9-ready',
    ];

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

  // Listen for incoming chat messages from WebSocket (orchestrator messages, etc.)
  useEffect(() => {
    if (!incomingMessages || incomingMessages.length === 0) return;

    // Add any new messages that aren't already in the chat
    for (const msg of incomingMessages) {
      setMessages((prev) => {
        // Don't add duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          role: msg.role as 'assistant' | 'system',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        }];
      });
    }
  }, [incomingMessages]);

  // Fetch full conversation history from agent executions
  // This restores the chat state when returning to a project
  useEffect(() => {
    if (!projectId) return;

    // Reset flag when projectId changes so we fetch fresh history
    hasFetchedInitialResponse.current = false;

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 20; // Poll for up to 20 seconds

    const fetchAgentHistory = async () => {
      if (cancelled || hasFetchedInitialResponse.current) return;

      try {
        // Fetch history, gates, and persisted chat events in parallel
        const [history, gates, chatEvents] = await Promise.all([
          agentsApi.getHistory(projectId),
          gatesApi.list(projectId).catch(() => []),
          projectsApi.getEvents(projectId, 'ChatMessage').catch(() => []),
        ]);

        // Get all COMPLETED executions with results
        // IMPORTANT: Only load PM_ONBOARDING (intake conversation)
        // DO NOT load ORCHESTRATOR - those messages contain stale gate transition info
        // The current gate status is determined from the database (gates array) and shown via status messages
        const completedExecutions = history.filter(
          exec => exec.agentType === 'PRODUCT_MANAGER_ONBOARDING' &&
                  exec.status === 'COMPLETED' &&
                  exec.outputResult
        );

        // Debug logging
        console.log('[ChatHistory] Total history items:', history.length);
        console.log('[ChatHistory] Conversational agents found:', completedExecutions.length);
        console.log('[ChatHistory] Chat events found:', chatEvents.length);

        // Also check if we have persisted chat events (for returning to project)
        const hasChatHistory = completedExecutions.length > 0 || chatEvents.length > 0;

        if (hasChatHistory && !cancelled) {
          hasFetchedInitialResponse.current = true;

          // Build full conversation history from all executions
          const historyMessages: ChatMessage[] = [];

          // Add persisted chat messages first
          // IMPORTANT: Filter out stale gate transition messages based on current gate status
          for (const event of chatEvents) {
            const eventData = event.eventData as { role?: string; content?: string };
            if (eventData.content) {
              // Skip stale gate transition messages (e.g., "Moving to Gate 2" when G2 is already approved)
              if (isStaleGateTransition(eventData.content, gates)) {
                console.log('[ChatHistory] Filtered stale gate message:', eventData.content.substring(0, 50));
                continue;
              }
              historyMessages.push({
                id: event.id,
                role: (eventData.role as 'assistant' | 'system') || 'assistant',
                content: eventData.content,
                timestamp: new Date(event.createdAt),
              });
            }
          }

          for (const exec of completedExecutions) {
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

            // Add assistant response (skip raw intake documents and MCP tool calls)
            if (exec.outputResult && !isIntakeDocument(exec.outputResult) && !hasMcpToolCalls(exec.outputResult)) {
              historyMessages.push({
                id: `history-${exec.id}`,
                role: 'assistant' as const,
                content: exec.outputResult,
                timestamp: new Date(exec.createdAt),
              });
            }
          }

          // Get current status from backend - single source of truth
          // This ALWAYS adds the current status as the last message
          try {
            const status = await projectsApi.getStatus(projectId);
            console.log('[ChatHistory] Current status from backend:', status);

            if (status.statusMessage) {
              const gateNumber = status.currentGate.match(/G(\d)/)?.[1] || '';
              const gateLabel = gateNumber ? `G${gateNumber}` : status.currentGate;
              const isReady = status.gateStatus === 'IN_REVIEW';

              // Always add current status - it will be shown as the latest message
              historyMessages.push({
                id: `status-${status.currentGate}-${Date.now()}`,
                role: 'assistant' as const,
                content: `## ${gateLabel} ${isReady ? 'Ready for Review' : 'In Progress'}

${status.statusMessage}

${status.userAction ? `**Next step:** ${status.userAction}` : ''}`,
                timestamp: new Date(),
              });
            }
          } catch (statusError) {
            console.warn('[ChatHistory] Failed to get status, falling back to basic message:', statusError);
          }

          if (historyMessages.length > 0) {
            // Sort messages by timestamp
            historyMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            // Deduplicate similar consecutive messages
            // This handles cases where similar status updates were sent multiple times
            const deduplicatedMessages: ChatMessage[] = [];
            for (const msg of historyMessages) {
              const lastMsg = deduplicatedMessages[deduplicatedMessages.length - 1];
              // Skip if this message is very similar to the last one (same role, similar content)
              if (lastMsg && lastMsg.role === msg.role) {
                const similarity = getSimilarity(lastMsg.content, msg.content);
                if (similarity > 0.8) {
                  // When messages are similar, always prefer the status-* message (current state from backend)
                  // Otherwise keep the longer/more detailed message
                  const msgIsStatus = msg.id.startsWith('status-');
                  const lastIsStatus = lastMsg.id.startsWith('status-');
                  if (msgIsStatus && !lastIsStatus) {
                    // Replace old message with current status
                    deduplicatedMessages[deduplicatedMessages.length - 1] = msg;
                  } else if (!msgIsStatus && lastIsStatus) {
                    // Keep the status message, skip this old one
                  } else if (msg.content.length > lastMsg.content.length) {
                    deduplicatedMessages[deduplicatedMessages.length - 1] = msg;
                  }
                  continue;
                }
              }
              deduplicatedMessages.push(msg);
            }

            console.log('[ChatHistory] Final message count after dedup:', deduplicatedMessages.length);
            setMessages(deduplicatedMessages);
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
    <div className={`flex flex-col ${isHorizontal ? 'max-h-[300px]' : 'h-full'} rounded-xl overflow-hidden ${isDark ? 'bg-slate-800/90 backdrop-blur-sm shadow-xl' : 'bg-white/95 backdrop-blur-sm border border-teal-200 shadow-xl'}`}>
      {/* Header - compact in horizontal mode */}
      {!isHorizontal && (
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
      )}

      {/* Messages - vertical scroll, compact in horizontal mode */}
      <div className={`${isHorizontal ? 'max-h-[200px]' : 'flex-1'} overflow-y-auto p-3 space-y-3 min-h-0`}>
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

        {/* Agent streaming output - supports multiple parallel agents */}
        {isAgentWorking && activeAgentsList.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl rounded-bl-md max-w-[90%] overflow-hidden ${isDark ? 'bg-slate-700 border border-slate-600' : 'bg-white border border-teal-200'}`}
          >
            {/* Agent header - shows all working agents */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-slate-600 bg-slate-700/50' : 'border-teal-100 bg-teal-50'}`}>
              <motion.div
                className={`w-2 h-2 rounded-full bg-emerald-400`}
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <div className="flex flex-wrap items-center gap-1">
                {activeAgentsList.map((agent, index) => (
                  <span key={agent.agentType + index}>
                    <span className={`text-[10px] font-semibold ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                      {agent.agentType.replace(/_/g, ' ')}
                    </span>
                    {index < activeAgentsList.length - 1 && (
                      <span className={`text-[10px] mx-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>&</span>
                    )}
                  </span>
                ))}
              </div>
              <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {activeAgentsList.length > 1 ? 'working in parallel...' : 'working...'}
              </span>
            </div>
            {/* Streaming content or background work indicator */}
            <div className={`px-3 py-2 text-xs leading-relaxed ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {activeAgentsList.every(agent => isBackgroundAgent(agent.agentType)) ? (
                // All background agents: show progress for each
                <div className="space-y-2">
                  {activeAgentsList.map((agent, index) => (
                    <div key={agent.agentType + index} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-400' : 'bg-teal-600'}`}
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 0.5, delay: (i + index * 3) * 0.1, repeat: Infinity }}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                        {agent.taskDescription || getBackgroundAgentMessage(agent.agentType)}
                      </span>
                    </div>
                  ))}
                  <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {getOutputLocationMessage(activeAgentsList)}
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
                // Fallback loading state - show all agents
                <div className="space-y-2">
                  {activeAgentsList.map((agent, index) => (
                    <div key={agent.agentType + index} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-400' : 'bg-teal-600'}`}
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 0.5, delay: (i + index * 3) * 0.1, repeat: Infinity }}
                          />
                        ))}
                      </div>
                      <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                        {agent.taskDescription || 'Starting task...'}
                      </span>
                    </div>
                  ))}
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

      {/* Input - always interactive, never blocked */}
      <div className={`p-3 border-t relative z-50 ${isDark ? 'border-slate-700/50' : 'border-teal-200'}`}>
        <div className={`flex items-center gap-2 rounded-full px-3 py-2 ${isDark ? 'bg-slate-700/50' : 'bg-white border border-teal-200'}`}>
          {isHorizontal && (
            <div className="relative flex-shrink-0">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
                <CpuChipIcon className="w-3 h-3 text-white" />
              </div>
              <motion.div
                className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ${isDark ? 'border border-slate-800' : 'border border-teal-50'}`}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isHorizontal ? "Message the orchestrator..." : "Type your response..."}
            autoFocus
            className={`flex-1 bg-transparent text-xs focus:outline-none pointer-events-auto ${isDark ? 'text-white placeholder-teal-300/50' : 'text-teal-900 placeholder-teal-400'}`}
          />
          <button onClick={handleSend} className={`w-7 h-7 rounded-full text-white flex items-center justify-center pointer-events-auto flex-shrink-0 ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
            <PaperAirplaneIcon className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrchestratorChat;
