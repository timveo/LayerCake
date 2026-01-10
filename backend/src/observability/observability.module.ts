import { Module, Global } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { SentryService } from './sentry.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [TracingService, SentryService, MetricsService],
  exports: [TracingService, SentryService, MetricsService],
})
export class ObservabilityModule {}
