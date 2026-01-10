import React, { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';

export interface AgentMessage {
  type: 'started' | 'progress' | 'completed' | 'failed';
  agentId: string;
  agentType: string;
  timestamp: string;
  output?: string;
  result?: any;
  error?: string;
}

interface AgentOutputTerminalProps {
  projectId: string;
  agentId?: string;
  autoScroll?: boolean;
  maxHeight?: string;
}

export const AgentOutputTerminal: React.FC<AgentOutputTerminalProps> = ({
  projectId,
  agentId,
  autoScroll = true,
  maxHeight = '500px',
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(autoScroll);

  const { socket, isConnected: socketConnected } = useWebSocket();

  useEffect(() => {
    setIsConnected(socketConnected);
  }, [socketConnected]);

  // Subscribe to agent events
  useEffect(() => {
    if (!socket) return;

    const handleAgentStarted = (data: any) => {
      if (data.projectId === projectId && (!agentId || data.agentId === agentId)) {
        setMessages((prev) => [
          ...prev,
          {
            type: 'started',
            agentId: data.agentId,
            agentType: data.agentType,
            timestamp: new Date().toISOString(),
            output: `[${new Date().toLocaleTimeString()}] Agent ${data.agentType} started: ${data.taskDescription}`,
          },
        ]);
      }
    };

    const handleAgentProgress = (data: any) => {
      if (data.projectId === projectId && (!agentId || data.agentId === agentId)) {
        setMessages((prev) => [
          ...prev,
          {
            type: 'progress',
            agentId: data.agentId,
            agentType: data.agentType || 'unknown',
            timestamp: new Date().toISOString(),
            output: data.output,
          },
        ]);
      }
    };

    const handleAgentCompleted = (data: any) => {
      if (data.projectId === projectId && (!agentId || data.agentId === agentId)) {
        setMessages((prev) => [
          ...prev,
          {
            type: 'completed',
            agentId: data.agentId,
            agentType: data.agentType || 'unknown',
            timestamp: new Date().toISOString(),
            output: `[${new Date().toLocaleTimeString()}] Agent ${data.agentType} completed successfully`,
            result: data.result,
          },
        ]);
      }
    };

    const handleAgentFailed = (data: any) => {
      if (data.projectId === projectId && (!agentId || data.agentId === agentId)) {
        setMessages((prev) => [
          ...prev,
          {
            type: 'failed',
            agentId: data.agentId,
            agentType: data.agentType || 'unknown',
            timestamp: new Date().toISOString(),
            error: data.error,
            output: `[${new Date().toLocaleTimeString()}] Agent ${data.agentType} failed: ${data.error}`,
          },
        ]);
      }
    };

    socket.on('agent:started', handleAgentStarted);
    socket.on('agent:progress', handleAgentProgress);
    socket.on('agent:completed', handleAgentCompleted);
    socket.on('agent:failed', handleAgentFailed);

    return () => {
      socket.off('agent:started', handleAgentStarted);
      socket.off('agent:progress', handleAgentProgress);
      socket.off('agent:completed', handleAgentCompleted);
      socket.off('agent:failed', handleAgentFailed);
    };
  }, [socket, projectId, agentId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    shouldAutoScrollRef.current = isAtBottom;
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const getMessageColor = (type: AgentMessage['type']) => {
    switch (type) {
      case 'started':
        return 'text-blue-400';
      case 'progress':
        return 'text-gray-300';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden border border-gray-700">
      {/* Terminal Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-sm text-gray-400 ml-2 font-mono">Agent Output</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            ></div>
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Clear Button */}
          <button
            onClick={clearMessages}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            title="Clear output"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="p-4 font-mono text-sm overflow-y-auto bg-gray-900"
        style={{ maxHeight }}
      >
        {messages.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            Waiting for agent output...
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`mb-1 ${getMessageColor(message.type)}`}>
              {message.output}
            </div>
          ))
        )}

        {/* Cursor */}
        {messages.length > 0 && messages[messages.length - 1].type === 'progress' && (
          <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1"></span>
        )}
      </div>
    </div>
  );
};
