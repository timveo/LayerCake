import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
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
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
