import { Module } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import { CodeParserService } from './code-parser.service';
import { BuildExecutorService } from './build-executor.service';
import { GitIntegrationService } from './git-integration.service';
import { PreviewServerService } from './preview-server.service';
import { CodeGenerationController } from './code-generation.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [PrismaModule, WebSocketModule],
  controllers: [CodeGenerationController],
  providers: [
    FileSystemService,
    CodeParserService,
    BuildExecutorService,
    GitIntegrationService,
    PreviewServerService,
  ],
  exports: [
    FileSystemService,
    CodeParserService,
    BuildExecutorService,
    GitIntegrationService,
    PreviewServerService,
  ],
})
export class CodeGenerationModule {}
