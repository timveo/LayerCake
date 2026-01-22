import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentExecutionService } from './services/agent-execution.service';
import { AgentTemplateLoaderService } from './services/agent-template-loader.service';
import { AIProviderService } from './services/ai-provider.service';
import { ToolEnabledAIProviderService } from './services/tool-enabled-ai-provider.service';
import { OrchestratorService } from './services/orchestrator.service';
import { WorkflowCoordinatorService } from './services/workflow-coordinator.service';
import { AgentRetryService } from './services/agent-retry.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { GatesModule } from '../gates/gates.module';
import { DocumentsModule } from '../documents/documents.module';
import { CodeGenerationModule } from '../code-generation/code-generation.module';
import { EventsModule } from '../events/events.module';
import { SessionContextModule } from '../session-context/session-context.module';
import { CostTrackingModule } from '../cost-tracking/cost-tracking.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [
    PrismaModule,
    WebSocketModule,
    GatesModule,
    DocumentsModule,
    CodeGenerationModule,
    EventsModule,
    SessionContextModule,
    CostTrackingModule,
    AgentMemoryModule,
    McpModule, // No longer needs forwardRef - MCP doesn't depend on Agents
  ],
  controllers: [AgentsController],
  providers: [
    AgentExecutionService,
    AgentTemplateLoaderService,
    AIProviderService,
    ToolEnabledAIProviderService,
    OrchestratorService,
    WorkflowCoordinatorService,
    AgentRetryService,
  ],
  exports: [
    AgentExecutionService,
    AgentTemplateLoaderService,
    AIProviderService,
    ToolEnabledAIProviderService,
    OrchestratorService,
    WorkflowCoordinatorService,
  ],
})
export class AgentsModule {}
