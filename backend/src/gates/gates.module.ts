import { Module } from '@nestjs/common';
import { GatesService } from './gates.service';
import { GatesController } from './gates.controller';
import { GateStateMachineService } from './services/gate-state-machine.service';
import { G1PresentationService } from './services/g1-presentation.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { RisksModule } from '../risks/risks.module';
import { DecisionsModule } from '../decisions/decisions.module';
import { DeliverablesModule } from '../deliverables/deliverables.module';
import { CodeGenerationModule } from '../code-generation/code-generation.module';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    RisksModule,
    DecisionsModule,
    DeliverablesModule,
    CodeGenerationModule,
  ],
  controllers: [GatesController],
  providers: [GatesService, GateStateMachineService, G1PresentationService],
  exports: [GatesService, GateStateMachineService, G1PresentationService],
})
export class GatesModule {}
