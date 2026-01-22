import { Module } from '@nestjs/common';
import { McpServerService } from './mcp-server.service';
import { McpToolsService } from './mcp-tools.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { StateSyncModule } from '../state-sync/state-sync.module';
import { CodeGenerationModule } from '../code-generation/code-generation.module';
import { GitHubModule } from '../integrations/github/github.module';
import { RailwayModule } from '../integrations/railway/railway.module';
import { EventsModule } from '../events/events.module';

/**
 * MCP Module - Tool Execution Layer
 *
 * Provides MCP protocol tools for agent execution.
 * NOTE: This module should NOT depend on AgentsModule to avoid circular dependencies.
 * Agents import McpModule, not the other way around.
 */
@Module({
  imports: [
    PrismaModule,
    StateSyncModule,
    CodeGenerationModule,
    GitHubModule,
    RailwayModule,
    EventsModule,
  ],
  providers: [McpServerService, McpToolsService],
  exports: [McpServerService, McpToolsService],
})
export class McpModule {}
