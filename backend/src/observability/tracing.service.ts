import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * TracingService - OpenTelemetry Integration
 *
 * Provides distributed tracing and metrics:
 * - Automatic instrumentation (HTTP, DB, Redis, etc.)
 * - Custom spans for agent execution
 * - Performance metrics
 * - Export to OTLP-compatible backends (Jaeger, Tempo, etc.)
 */
@Injectable()
export class TracingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TracingService.name);
  private sdk: NodeSDK;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const enabled = this.config.get('OTEL_ENABLED', 'false') === 'true';

    if (!enabled) {
      this.logger.warn('OpenTelemetry disabled. Set OTEL_ENABLED=true to enable tracing.');
      return;
    }

    try {
      await this.initializeSDK();
      this.logger.log('OpenTelemetry initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize OpenTelemetry: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.log('OpenTelemetry shut down');
    }
  }

  private async initializeSDK() {
    const endpoint = this.config.get(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318',
    );

    // Trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    // Metrics exporter
    const metricExporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
    });

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export every 60 seconds
    });

    // Resource attributes
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'layercake-backend',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        this.config.get('NODE_ENV', 'development'),
    });

    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Customize auto-instrumentation
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingPaths: ['/health', '/metrics'],
          },
          '@opentelemetry/instrumentation-pg': {
            // Track database queries
            enhancedDatabaseReporting: true,
          },
        }),
      ],
    });

    await this.sdk.start();
  }
}
