import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

export interface TrackEventOptions {
  userId?: string;
  properties?: Record<string, any>;
  timestamp?: Date;
}

export interface IdentifyUserOptions {
  email?: string;
  name?: string;
  createdAt?: Date;
  plan?: string;
  [key: string]: any;
}

/**
 * AnalyticsService - PostHog Product Analytics
 *
 * Tracks user behavior and product usage:
 * - User registration and login
 * - Project creation and completion
 * - Gate approvals
 * - Agent execution
 * - Feature usage
 * - Conversion events
 *
 * Data is used for:
 * - Feature prioritization
 * - User onboarding optimization
 * - Conversion funnel analysis
 * - Retention metrics
 */
@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);
  private posthog: PostHog | null = null;
  private enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('POSTHOG_API_KEY');
    const host = this.config.get<string>('POSTHOG_HOST', 'https://app.posthog.com');
    this.enabled = !!apiKey && this.config.get('NODE_ENV') !== 'test';

    if (this.enabled) {
      this.posthog = new PostHog(apiKey, {
        host,
        flushAt: 20, // Send after 20 events
        flushInterval: 10000, // Or every 10 seconds
      });

      this.logger.log('PostHog analytics initialized');
    } else {
      this.logger.warn('PostHog analytics disabled (no API key or test environment)');
    }
  }

  async onModuleInit() {
    // No-op, PostHog initializes in constructor
  }

  /**
   * Track an event
   */
  track(event: string, options: TrackEventOptions = {}): void {
    if (!this.enabled || !this.posthog) {
      return;
    }

    try {
      this.posthog.capture({
        distinctId: options.userId || 'anonymous',
        event,
        properties: options.properties,
        timestamp: options.timestamp,
      });
    } catch (error) {
      this.logger.error(`Failed to track event ${event}: ${error.message}`);
    }
  }

  /**
   * Identify a user
   */
  identify(userId: string, properties: IdentifyUserOptions = {}): void {
    if (!this.enabled || !this.posthog) {
      return;
    }

    try {
      this.posthog.identify({
        distinctId: userId,
        properties,
      });
    } catch (error) {
      this.logger.error(`Failed to identify user ${userId}: ${error.message}`);
    }
  }

  /**
   * Track user registration
   */
  trackUserRegistered(userId: string, email: string, method: 'email' | 'github'): void {
    this.identify(userId, { email, signupMethod: method });
    this.track('user_registered', {
      userId,
      properties: { email, method },
    });
  }

  /**
   * Track user login
   */
  trackUserLogin(userId: string, method: 'email' | 'github' | 'jwt'): void {
    this.track('user_login', {
      userId,
      properties: { method },
    });
  }

  /**
   * Track project created
   */
  trackProjectCreated(
    userId: string,
    projectId: string,
    projectType: string,
    starter?: string,
  ): void {
    this.track('project_created', {
      userId,
      properties: {
        projectId,
        projectType,
        starter,
      },
    });
  }

  /**
   * Track gate approved
   */
  trackGateApproved(userId: string, projectId: string, gateType: string): void {
    this.track('gate_approved', {
      userId,
      properties: {
        projectId,
        gateType,
      },
    });
  }

  /**
   * Track gate rejected
   */
  trackGateRejected(
    userId: string,
    projectId: string,
    gateType: string,
    reason?: string,
  ): void {
    this.track('gate_rejected', {
      userId,
      properties: {
        projectId,
        gateType,
        reason,
      },
    });
  }

  /**
   * Track agent execution
   */
  trackAgentExecuted(
    userId: string,
    projectId: string,
    agentType: string,
    success: boolean,
    durationSeconds: number,
  ): void {
    this.track('agent_executed', {
      userId,
      properties: {
        projectId,
        agentType,
        success,
        durationSeconds,
      },
    });
  }

  /**
   * Track project completed (G9)
   */
  trackProjectCompleted(
    userId: string,
    projectId: string,
    durationMinutes: number,
  ): void {
    this.track('project_completed', {
      userId,
      properties: {
        projectId,
        durationMinutes,
      },
    });
  }

  /**
   * Track GitHub export
   */
  trackGitHubExport(userId: string, projectId: string, repoUrl: string): void {
    this.track('github_export', {
      userId,
      properties: {
        projectId,
        repoUrl,
      },
    });
  }

  /**
   * Track Railway deployment
   */
  trackRailwayDeployment(
    userId: string,
    projectId: string,
    deploymentUrl: string,
  ): void {
    this.track('railway_deployment', {
      userId,
      properties: {
        projectId,
        deploymentUrl,
      },
    });
  }

  /**
   * Track subscription started
   */
  trackSubscriptionStarted(userId: string, plan: string, amount: number): void {
    this.identify(userId, { plan });
    this.track('subscription_started', {
      userId,
      properties: {
        plan,
        amount,
      },
    });
  }

  /**
   * Track subscription cancelled
   */
  trackSubscriptionCancelled(userId: string, plan: string, reason?: string): void {
    this.track('subscription_cancelled', {
      userId,
      properties: {
        plan,
        reason,
      },
    });
  }

  /**
   * Track feature used
   */
  trackFeatureUsed(userId: string, feature: string, metadata?: Record<string, any>): void {
    this.track('feature_used', {
      userId,
      properties: {
        feature,
        ...metadata,
      },
    });
  }

  /**
   * Flush pending events (call on shutdown)
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.posthog) {
      return;
    }

    try {
      await this.posthog.shutdown();
      this.logger.log('PostHog events flushed');
    } catch (error) {
      this.logger.error(`Failed to flush PostHog events: ${error.message}`);
    }
  }
}
