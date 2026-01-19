import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth';
import { config } from '../lib/config';

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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const currentProjectIdRef = useRef<string | undefined>(projectId);

  // Store events in a ref to avoid recreating socket on every render
  const eventsRef = useRef(events);

  // Update eventsRef in an effect to avoid accessing refs during render
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

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

  // Main socket connection effect - only depends on user
  useEffect(() => {
    if (!user) return;

    const token = getToken();
    if (!token) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setError('No authentication token found'), 0);
      return () => clearTimeout(timer);
    }

    // Connect to WebSocket server
    const socket = io(config.wsUrl, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;
    // Use setTimeout to avoid synchronous setState in effect
    const socketTimer = setTimeout(() => setSocket(socket), 0);

    // Connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setIsConnected(true);
      setError(null);

      // Join project room if projectId provided
      if (currentProjectIdRef.current) {
        console.log('Joining project room on connect:', currentProjectIdRef.current);
        socket.emit('join:project', { projectId: currentProjectIdRef.current });
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

    // Agent execution event handlers - use refs to always get latest handlers
    socket.on('agent:started', (event) => {
      console.log('Received agent:started event:', event);
      eventsRef.current?.onAgentStarted?.(event);
    });

    socket.on('agent:chunk', (event) => {
      eventsRef.current?.onAgentChunk?.(event);
    });

    socket.on('agent:completed', (event) => {
      console.log('Received agent:completed event:', event);
      eventsRef.current?.onAgentCompleted?.(event);
    });

    socket.on('agent:failed', (event) => {
      console.log('Received agent:failed event:', event);
      eventsRef.current?.onAgentFailed?.(event);
    });

    socket.on('gate:ready', (event) => {
      console.log('Received gate:ready event:', event);
      eventsRef.current?.onGateReady?.(event);
    });

    socket.on('gate:approved', (event) => {
      eventsRef.current?.onGateApproved?.(event);
    });

    socket.on('task:created', (event) => {
      eventsRef.current?.onTaskCreated?.(event);
    });

    socket.on('document:created', (event) => {
      console.log('Received document:created event:', event);
      eventsRef.current?.onDocumentCreated?.(event);
    });

    socket.on('notification', (event) => {
      eventsRef.current?.onNotification?.(event);
    });

    // Cleanup on unmount
    return () => {
      clearTimeout(socketTimer);
      if (currentProjectIdRef.current && socket.connected) {
        socket.emit('leave:project', { projectId: currentProjectIdRef.current });
      }
      socket.disconnect();
    };
  }, [user, getToken]);

  // Handle project room changes - join/leave rooms when projectId changes
  useEffect(() => {
    const socket = socketRef.current;
    const previousProjectId = currentProjectIdRef.current;
    currentProjectIdRef.current = projectId;

    if (!socket?.connected) return;

    // Leave previous room
    if (previousProjectId && previousProjectId !== projectId) {
      console.log('Leaving project room:', previousProjectId);
      socket.emit('leave:project', { projectId: previousProjectId });
    }

    // Join new room
    if (projectId && projectId !== previousProjectId) {
      console.log('Joining project room:', projectId);
      socket.emit('join:project', { projectId });
    }
  }, [projectId]);

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
    socket,
    isConnected,
    error,
    joinProject,
    leaveProject,
  };
}
