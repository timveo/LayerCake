import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

/**
 * SentryService - Error Tracking & Performance Monitoring
 *
 * Features:
 * - Real-time error tracking
 * - Performance monitoring
 * - Release tracking
 * - User context
 * - Breadcrumbs
 */
@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dsn = this.config.get('SENTRY_DSN');

    if (!dsn) {
      this.logger.warn('SENTRY_DSN not configured. Error tracking disabled.');
      return;
    }

    try {
      Sentry.init({
        dsn,
        environment: this.config.get('NODE_ENV', 'development'),
        release: this.config.get('APP_VERSION', '1.0.0'),

        // Performance monitoring
        tracesSampleRate: this.config.get('SENTRY_TRACES_SAMPLE_RATE', 1.0),
        profilesSampleRate: this.config.get('SENTRY_PROFILES_SAMPLE_RATE', 1.0),

        integrations: [
          new ProfilingIntegration(),
        ],

        // Filter out health check noise
        beforeSend(event) {
          if (event.request?.url?.includes('/health')) {
            return null;
          }
          return event;
        },
      });

      this.logger.log('Sentry initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Sentry: ${error.message}`);
    }
  }

  /**
   * Capture exception with context
   */
  captureException(error: Error, context?: Record<string, any>) {
    Sentry.captureException(error, {
      extra: context,
    });
  }

  /**
   * Capture message
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    Sentry.captureMessage(message, level);
  }

  /**
   * Set user context
   */
  setUser(user: { id: string; email?: string; username?: string }) {
    Sentry.setUser(user);
  }

  /**
   * Clear user context
   */
  clearUser() {
    Sentry.setUser(null);
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, any>;
  }) {
    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Set tag
   */
  setTag(key: string, value: string) {
    Sentry.setTag(key, value);
  }

  /**
   * Set context
   */
  setContext(name: string, context: Record<string, any>) {
    Sentry.setContext(name, context);
  }

  /**
   * Start transaction (for performance monitoring)
   */
  startTransaction(name: string, op: string) {
    return Sentry.startTransaction({ name, op });
  }
}
