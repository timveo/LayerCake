import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { GatesModule } from './gates/gates.module';
import { DocumentsModule } from './documents/documents.module';
import { SpecificationsModule } from './specifications/specifications.module';
import { AgentsModule } from './agents/agents.module';
import { WebSocketModule } from './websocket/websocket.module';
import { ProofArtifactsModule } from './proof-artifacts/proof-artifacts.module';
import { ErrorHistoryModule } from './error-history/error-history.module';
import { BlockersModule } from './blockers/blockers.module';
import { QueriesModule } from './queries/queries.module';
import { EscalationsModule } from './escalations/escalations.module';
import { MetricsModule } from './metrics/metrics.module';
import { PhaseHistoryModule } from './phase-history/phase-history.module';
import { RisksModule } from './risks/risks.module';
import { NotesModule } from './notes/notes.module';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { SessionContextModule } from './session-context/session-context.module';
import { CostTrackingModule } from './cost-tracking/cost-tracking.module';
import { CodeGenerationModule } from './code-generation/code-generation.module';
import { GitHubModule } from './integrations/github/github.module';
import { RailwayModule } from './integrations/railway/railway.module';
import { StateSyncModule } from './state-sync/state-sync.module';
import { EventsModule } from './events/events.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { QueueModule } from './queue/queue.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ObservabilityModule } from './observability/observability.module';
import { StorageModule } from './storage/storage.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    LoggerModule,
    ObservabilityModule,
    StorageModule,
    AnalyticsModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    GatesModule,
    DocumentsModule,
    SpecificationsModule,
    AgentsModule,
    WebSocketModule,
    ProofArtifactsModule,
    ErrorHistoryModule,
    BlockersModule,
    QueriesModule,
    EscalationsModule,
    MetricsModule,
    PhaseHistoryModule,
    RisksModule,
    NotesModule,
    DeliverablesModule,
    SessionContextModule,
    CostTrackingModule,
    CodeGenerationModule,
    GitHubModule,
    RailwayModule,
    StateSyncModule,
    EventsModule,
    EmbeddingsModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
