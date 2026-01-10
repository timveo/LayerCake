import { Module } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import { CodeParserService } from './code-parser.service';
import { BuildExecutorService } from './build-executor.service';
import { GitIntegrationService } from './git-integration.service';
import { CodeGenerationController } from './code-generation.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CodeGenerationController],
  providers: [
    FileSystemService,
    CodeParserService,
    BuildExecutorService,
    GitIntegrationService,
  ],
  exports: [
    FileSystemService,
    CodeParserService,
    BuildExecutorService,
    GitIntegrationService,
  ],
})
export class CodeGenerationModule {}
