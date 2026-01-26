import {
  WebSocketGateway as WsGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';

@WsGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    credentials: true,
  },
})
export class AppWebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('WebSocketGateway');
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Get token from handshake auth
      const token =
        client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} attempted connection without token`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      // Store socket for this user
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      // Store userId in socket data for later use
      client.data.userId = userId;

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);

      // Join user's personal room
      client.join(`user:${userId}`);

      // Send connection confirmation
      client.emit('connected', { userId, socketId: client.id });
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(client.id);

      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }

    this.logger.log(`Client disconnected: ${client.id} (User: ${userId || 'unknown'})`);
  }

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Verify user owns the project
    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      select: { ownerId: true },
    });

    if (!project || project.ownerId !== userId) {
      client.emit('error', { message: 'Project not found or access denied' });
      return;
    }

    // Join project room
    client.join(`project:${data.projectId}`);
    this.logger.log(`Client ${client.id} joined project room: ${data.projectId}`);

    client.emit('project:joined', { projectId: data.projectId });
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    client.leave(`project:${data.projectId}`);
    this.logger.log(`Client ${client.id} left project room: ${data.projectId}`);
  }

  // Emit agent execution events
  emitAgentStarted(projectId: string, agentId: string, agentType: string, taskDescription: string) {
    this.server.to(`project:${projectId}`).emit('agent:started', {
      agentId,
      agentType,
      taskDescription,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Agent started: ${agentType} for project ${projectId}`);
  }

  emitAgentChunk(projectId: string, agentId: string, chunk: string) {
    // Strip <thinking> tags from chunks - these are internal reasoning not meant for users
    // We need to handle partial tags that might come across chunk boundaries
    const cleanedChunk = chunk.replace(/<thinking>/gi, '').replace(/<\/thinking>/gi, '');

    // Only emit if there's content left after cleaning
    if (cleanedChunk) {
      this.server.to(`project:${projectId}`).emit('agent:chunk', {
        agentId,
        chunk: cleanedChunk,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit agent progress update - high-level task status for user visibility
   * Used to show users what agents are working on during execution
   */
  emitAgentProgress(
    projectId: string,
    agentId: string,
    agentType: string,
    progressMessage: string,
  ) {
    this.server.to(`project:${projectId}`).emit('agent:progress', {
      agentId,
      agentType,
      message: progressMessage,
      timestamp: new Date().toISOString(),
    });

    this.logger.debug(`Agent progress: ${agentType} - ${progressMessage}`);
  }

  emitAgentCompleted(projectId: string, agentId: string, result: any, agentType?: string) {
    // Strip <thinking> tags from result content if present
    let cleanedResult = result;
    if (result && typeof result.content === 'string') {
      cleanedResult = {
        ...result,
        content: result.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim(),
      };
    }

    this.server.to(`project:${projectId}`).emit('agent:completed', {
      agentId,
      agentType,
      result: cleanedResult,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Agent completed: ${agentId} (${agentType || 'unknown'}) for project ${projectId}`,
    );
  }

  /**
   * Emit agent completed with warnings - used when post-processing partially failed
   * The agent execution succeeded but some deliverables may be missing
   */
  emitAgentCompletedWithWarnings(
    projectId: string,
    agentId: string,
    result: any,
    warnings: Array<{ operation: string; message: string; severity: string }>,
    agentType?: string,
  ) {
    this.server.to(`project:${projectId}`).emit('agent:completed_with_warnings', {
      agentId,
      agentType,
      result,
      warnings,
      timestamp: new Date().toISOString(),
    });

    this.logger.warn(
      `Agent completed with warnings: ${agentId} (${agentType || 'unknown'}) for project ${projectId} - ${warnings.length} warning(s)`,
    );

    // Also emit a notification for critical warnings
    const criticalWarnings = warnings.filter((w) => w.severity === 'critical');
    if (criticalWarnings.length > 0) {
      const warningMessages = criticalWarnings
        .map((w) => `${w.operation}: ${w.message}`)
        .join('; ');
      this.server.to(`project:${projectId}`).emit('notification', {
        type: 'warning',
        title: 'Agent Completed with Issues',
        message: `Some operations failed: ${warningMessages}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  emitAgentFailed(projectId: string, agentId: string, error: string) {
    this.server.to(`project:${projectId}`).emit('agent:failed', {
      agentId,
      error,
      timestamp: new Date().toISOString(),
    });

    this.logger.error(`Agent failed: ${agentId} for project ${projectId} - ${error}`);
  }

  /**
   * Emit a chat message to be displayed in the orchestrator chat
   * Used for important system messages like gate approval requests
   * Also persists the message to ProjectEvent for history restoration
   */
  emitChatMessage(
    projectId: string,
    messageId: string,
    content: string,
    role: 'assistant' | 'system' = 'assistant',
  ) {
    const timestamp = new Date().toISOString();

    // Strip <thinking> tags - these are internal reasoning not meant for users
    const cleanedContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

    this.server.to(`project:${projectId}`).emit('chat:message', {
      id: messageId,
      role,
      content: cleanedContent,
      timestamp,
    });

    // Persist to ProjectEvent for history restoration when returning to project
    this.prisma.projectEvent
      .create({
        data: {
          id: messageId,
          projectId,
          eventType: 'ChatMessage',
          eventData: { role, content },
          metadata: { source: 'orchestrator' },
        },
      })
      .catch((err) => {
        this.logger.warn(`Failed to persist chat message ${messageId}: ${err.message}`);
      });

    this.logger.log(`Chat message emitted for project ${projectId}: ${messageId}`);
  }

  emitGateReady(projectId: string, gateId: string, gateType: string, artifacts: any[]) {
    this.server.to(`project:${projectId}`).emit('gate:ready', {
      gateId,
      gateType,
      artifacts,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Gate ready: ${gateType} for project ${projectId}`);
  }

  emitGateApproved(projectId: string, gateId: string, gateType: string, approvedBy: string) {
    this.server.to(`project:${projectId}`).emit('gate:approved', {
      gateId,
      gateType,
      approvedBy,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Gate approved: ${gateType} for project ${projectId}`);
  }

  emitTaskCreated(projectId: string, task: any) {
    this.server.to(`project:${projectId}`).emit('task:created', {
      task,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Task created: ${task.id} for project ${projectId}`);
  }

  /**
   * Emit when G6 tests fail - triggers developer agents to fix issues
   * This enables the G6 feedback loop where failing tests get sent back to developers
   */
  emitTestFailure(
    projectId: string,
    testResults: {
      unitTests: { success: boolean; errors: string[] };
      e2eTests: { success: boolean; errors: string[] };
      integrationTests: { success: boolean; errors: string[] };
      needsBackendFix: boolean;
      needsFrontendFix: boolean;
    },
  ) {
    this.server.to(`project:${projectId}`).emit('g6:test_failure', {
      projectId,
      testResults,
      timestamp: new Date().toISOString(),
    });

    this.logger.warn(
      `G6 test failure for project ${projectId}: ` +
        `Backend fix needed: ${testResults.needsBackendFix}, Frontend fix needed: ${testResults.needsFrontendFix}`,
    );
  }

  emitDocumentCreated(projectId: string, document: any) {
    this.server.to(`project:${projectId}`).emit('document:created', {
      document,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Document created: ${document.id} for project ${projectId}`);
  }

  /**
   * Emit when code files are written to the workspace
   * This triggers the code tab to refresh and show updated files
   */
  emitWorkspaceUpdated(
    projectId: string,
    files: Array<{ path: string; action: 'created' | 'updated' | 'deleted' }>,
  ) {
    this.server.to(`project:${projectId}`).emit('workspace:updated', {
      projectId,
      files,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Workspace updated for project ${projectId}: ${files.length} file(s) changed`);
  }

  /**
   * Emit when a single file is written - convenience method
   */
  emitFileWritten(projectId: string, filePath: string, action: 'created' | 'updated' = 'created') {
    this.emitWorkspaceUpdated(projectId, [{ path: filePath, action }]);
  }

  emitNotification(userId: string, notification: { type: string; message: string; data?: any }) {
    this.server.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an orchestrator message to the chat interface
   * Used for assumptions, status updates, and system messages
   */
  emitOrchestratorMessage(
    projectId: string,
    message: string,
    messageType: 'assumptions' | 'status' | 'info' | 'warning' = 'info',
  ) {
    this.server.to(`project:${projectId}`).emit('orchestrator:message', {
      message,
      messageType,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Orchestrator message (${messageType}) sent to project ${projectId}`);
  }

  // Get active connections for a user
  getUserConnections(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }
}
