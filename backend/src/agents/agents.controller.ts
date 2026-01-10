import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AgentExecutionService } from './services/agent-execution.service';
import { AgentTemplateLoaderService } from './services/agent-template-loader.service';
import { OrchestratorService } from './services/orchestrator.service';
import { WorkflowCoordinatorService } from './services/workflow-coordinator.service';
import { ExecuteAgentDto } from './dto/execute-agent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';

@ApiTags('agents')
@Controller('agents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentsController {
  constructor(
    private readonly executionService: AgentExecutionService,
    private readonly templateLoader: AgentTemplateLoaderService,
    private readonly orchestrator: OrchestratorService,
    private readonly workflowCoordinator: WorkflowCoordinatorService,
    private readonly wsGateway: AppWebSocketGateway,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get all available agent templates' })
  @ApiResponse({ status: 200, description: 'Agent templates retrieved successfully' })
  async getTemplates() {
    return this.templateLoader.getAllTemplates();
  }

  @Get('templates/:role')
  @ApiOperation({ summary: 'Get a specific agent template by role' })
  @ApiResponse({ status: 200, description: 'Agent template retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Agent template not found' })
  async getTemplate(@Param('role') role: string) {
    const template = this.templateLoader.getTemplate(role as any);
    if (!template) {
      throw new Error('Template not found');
    }
    return template;
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute an agent' })
  @ApiResponse({ status: 200, description: 'Agent executed successfully' })
  @ApiResponse({ status: 400, description: 'Execution limit reached or invalid request' })
  @ApiResponse({ status: 403, description: 'Cannot execute agent for project you do not own' })
  async execute(
    @Body() executeDto: ExecuteAgentDto,
    @CurrentUser() user: any,
  ) {
    return this.executionService.executeAgent(executeDto, user.id);
  }

  @Post('execute-stream')
  @ApiOperation({ summary: 'Execute an agent with real-time streaming via WebSocket' })
  @ApiResponse({ status: 200, description: 'Agent execution started, results streaming via WebSocket' })
  @ApiResponse({ status: 400, description: 'Execution limit reached or invalid request' })
  @ApiResponse({ status: 403, description: 'Cannot execute agent for project you do not own' })
  async executeStream(
    @Body() executeDto: ExecuteAgentDto,
    @CurrentUser() user: any,
  ) {
    // Start agent execution with streaming
    const agentExecutionId = await this.executionService.executeAgentStream(
      executeDto,
      user.id,
      {
        onChunk: (chunk: string) => {
          // Stream chunks to WebSocket
          this.wsGateway.emitAgentChunk(executeDto.projectId, agentExecutionId, chunk);
        },
        onComplete: (response) => {
          // Notify completion via WebSocket
          this.wsGateway.emitAgentCompleted(executeDto.projectId, agentExecutionId, {
            content: response.content,
            usage: response.usage,
            finishReason: response.finishReason,
          });
        },
        onError: (error) => {
          // Notify error via WebSocket
          this.wsGateway.emitAgentFailed(executeDto.projectId, agentExecutionId, error.message);
        },
      },
    );

    // Emit agent started event
    this.wsGateway.emitAgentStarted(
      executeDto.projectId,
      agentExecutionId,
      executeDto.agentType,
      executeDto.userPrompt,
    );

    return {
      success: true,
      agentExecutionId,
      message: 'Agent execution started. Results will be streamed via WebSocket.',
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get agent execution history for a project' })
  @ApiResponse({ status: 200, description: 'Agent history retrieved successfully' })
  async getHistory(
    @Query('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.executionService.getAgentHistory(projectId, user.id);
  }

  @Get('executions/:id')
  @ApiOperation({ summary: 'Get a specific agent execution by ID' })
  @ApiResponse({ status: 200, description: 'Agent execution retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Agent execution not found' })
  async getExecution(@Param('id') id: string, @CurrentUser() user: any) {
    return this.executionService.getAgentExecution(id, user.id);
  }

  @Post('orchestrator/decompose')
  @ApiOperation({ summary: 'Decompose requirements into agent tasks' })
  @ApiResponse({ status: 200, description: 'Requirements decomposed successfully' })
  async decomposeRequirements(
    @Body() body: { projectId: string; requirements: string },
    @CurrentUser() user: any,
  ) {
    return this.orchestrator.decomposeRequirements(body.projectId, body.requirements);
  }

  @Get('orchestrator/progress/:projectId')
  @ApiOperation({ summary: 'Get project progress and next actions' })
  @ApiResponse({ status: 200, description: 'Project progress retrieved successfully' })
  async getProgress(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.orchestrator.getProjectProgress(projectId);
  }

  @Get('orchestrator/next-task/:projectId')
  @ApiOperation({ summary: 'Get next executable task for project' })
  @ApiResponse({ status: 200, description: 'Next task retrieved successfully' })
  async getNextTask(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.orchestrator.getNextExecutableTask(projectId);
  }

  @Post('orchestrator/route/:projectId')
  @ApiOperation({ summary: 'Route task to appropriate agent based on current gate' })
  @ApiResponse({ status: 200, description: 'Task routed successfully' })
  async routeTask(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.orchestrator.routeTaskToAgent(projectId, user.id);
  }

  @Post('workflow/start')
  @ApiOperation({ summary: 'Start project workflow with initial requirements' })
  @ApiResponse({ status: 200, description: 'Workflow started successfully' })
  async startWorkflow(
    @Body() body: { projectId: string; requirements: string },
    @CurrentUser() user: any,
  ) {
    return this.workflowCoordinator.startProjectWorkflow(
      body.projectId,
      user.id,
      body.requirements,
    );
  }

  @Post('workflow/execute-next/:projectId')
  @ApiOperation({ summary: 'Execute next task in workflow' })
  @ApiResponse({ status: 200, description: 'Next task execution started' })
  async executeNext(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.workflowCoordinator.executeNextTask(projectId, user.id);
  }

  @Get('workflow/status/:projectId')
  @ApiOperation({ summary: 'Get workflow status for project' })
  @ApiResponse({ status: 200, description: 'Workflow status retrieved successfully' })
  async getWorkflowStatus(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.workflowCoordinator.getWorkflowStatus(projectId, user.id);
  }
}
