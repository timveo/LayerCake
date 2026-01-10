import { Module, Global } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * AnalyticsModule - Global Product Analytics
 *
 * Provides PostHog analytics access across the application.
 * Marked as @Global() so all modules can inject AnalyticsService.
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
