import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';

interface AgentEvent {
  agentId: string;
  agentType?: string;
  taskDescription?: string;
  chunk?: string;
  result?: any;
  error?: string;
  timestamp: string;
}

interface WebSocketEvents {
  onAgentStarted?: (event: AgentEvent) => void;
  onAgentChunk?: (event: AgentEvent) => void;
  onAgentCompleted?: (event: AgentEvent) => void;
  onAgentFailed?: (event: AgentEvent) => void;
  onGateReady?: (event: any) => void;
  onGateApproved?: (event: any) => void;
  onTaskCreated?: (event: any) => void;
  onDocumentCreated?: (event: any) => void;
  onNotification?: (event: any) => void;
}

export function useWebSocket(projectId?: string, events?: WebSocketEvents) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);

  // Get access token
  const getToken = useCallback(() => {
    const authStorage = localStorage.getItem('auth-storage');
    if (!authStorage) return null;

    try {
      JSON.parse(authStorage); // Validate JSON
      // The token is stored in the state.user object after login
      // We need to get it from the API client's stored token
      const apiToken = localStorage.getItem('accessToken');
      return apiToken;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const token = getToken();
    if (!token) {
      setError('No authentication token found');
      return;
    }

    // Connect to WebSocket server
    const socket = io('http://localhost:3000', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setIsConnected(true);
      setError(null);

      // Join project room if projectId provided
      if (projectId) {
        socket.emit('join:project', { projectId });
      }
    });

    socket.on('connected', (data) => {
      console.log('WebSocket authenticated:', data);
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err);
      setError(err.message);
      setIsConnected(false);
    });

    socket.on('error', (data) => {
      console.error('WebSocket error:', data);
      setError(data.message);
    });

    socket.on('project:joined', (data) => {
      console.log('Joined project room:', data.projectId);
    });

    // Agent execution event handlers
    if (events?.onAgentStarted) {
      socket.on('agent:started', events.onAgentStarted);
    }

    if (events?.onAgentChunk) {
      socket.on('agent:chunk', events.onAgentChunk);
    }

    if (events?.onAgentCompleted) {
      socket.on('agent:completed', events.onAgentCompleted);
    }

    if (events?.onAgentFailed) {
      socket.on('agent:failed', events.onAgentFailed);
    }

    if (events?.onGateReady) {
      socket.on('gate:ready', events.onGateReady);
    }

    if (events?.onGateApproved) {
      socket.on('gate:approved', events.onGateApproved);
    }

    if (events?.onTaskCreated) {
      socket.on('task:created', events.onTaskCreated);
    }

    if (events?.onDocumentCreated) {
      socket.on('document:created', events.onDocumentCreated);
    }

    if (events?.onNotification) {
      socket.on('notification', events.onNotification);
    }

    // Cleanup on unmount
    return () => {
      if (projectId && socket.connected) {
        socket.emit('leave:project', { projectId });
      }
      socket.disconnect();
    };
  }, [user, projectId, getToken, events]);

  // Join a project room
  const joinProject = useCallback((newProjectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join:project', { projectId: newProjectId });
    }
  }, []);

  // Leave a project room
  const leaveProject = useCallback((oldProjectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave:project', { projectId: oldProjectId });
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    error,
    joinProject,
    leaveProject,
  };
}
