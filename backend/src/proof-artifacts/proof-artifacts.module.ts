import { Module } from '@nestjs/common';
import { ProofArtifactsService } from './proof-artifacts.service';
import { ProofArtifactsController } from './proof-artifacts.controller';
import { ValidationService } from './validators/validation.service';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProofArtifactsController],
  providers: [ProofArtifactsService, ValidationService],
  exports: [ProofArtifactsService, ValidationService],
})
export class ProofArtifactsModule {}
