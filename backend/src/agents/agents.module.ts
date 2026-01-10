import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentExecutionService } from './services/agent-execution.service';
import { AgentTemplateLoaderService } from './services/agent-template-loader.service';
import { AIProviderService } from './services/ai-provider.service';
import { OrchestratorService } from './services/orchestrator.service';
import { WorkflowCoordinatorService } from './services/workflow-coordinator.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { GatesModule } from '../gates/gates.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PrismaModule, WebSocketModule, GatesModule, DocumentsModule],
  controllers: [AgentsController],
  providers: [
    AgentExecutionService,
    AgentTemplateLoaderService,
    AIProviderService,
    OrchestratorService,
    WorkflowCoordinatorService,
  ],
  exports: [
    AgentExecutionService,
    AgentTemplateLoaderService,
    AIProviderService,
    OrchestratorService,
    WorkflowCoordinatorService,
  ],
})
export class AgentsModule {}
