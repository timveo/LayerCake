import { Module, forwardRef } from '@nestjs/common';
import { UniversalInputService } from './universal-input.service';
import { UniversalInputController } from './universal-input.controller';
import { InputClassifierService } from './services/input-classifier.service';
import { BackendAnalyzerService } from './services/backend-analyzer.service';
import { UIAnalyzerService } from './services/ui-analyzer.service';
import { CrossAnalyzerService } from './services/cross-analyzer.service';
import { GateRecommenderService } from './services/gate-recommender.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [PrismaModule, StorageModule, forwardRef(() => AssetsModule)],
  controllers: [UniversalInputController],
  providers: [
    UniversalInputService,
    InputClassifierService,
    BackendAnalyzerService,
    UIAnalyzerService,
    CrossAnalyzerService,
    GateRecommenderService,
  ],
  exports: [UniversalInputService, InputClassifierService, GateRecommenderService],
})
export class UniversalInputModule {}
