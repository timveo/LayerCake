import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  // JWT
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRATION: Joi.string().default('7d'),

  // Frontend
  FRONTEND_URL: Joi.string().uri().required(),

  // Observability
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional().allow(''),
  OTEL_SERVICE_NAME: Joi.string().default('layercake'),

  // Analytics
  POSTHOG_API_KEY: Joi.string().optional().allow(''),
  POSTHOG_HOST: Joi.string().uri().default('https://app.posthog.com'),

  // Storage
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  S3_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_BUCKET: Joi.string().optional().allow(''),
  S3_REGION: Joi.string().default('auto'),

  // AI Providers
  OPENAI_API_KEY: Joi.string().required(),
  ANTHROPIC_API_KEY: Joi.string().required(),

  // GitHub
  GITHUB_CLIENT_ID: Joi.string().optional().allow(''),
  GITHUB_CLIENT_SECRET: Joi.string().optional().allow(''),
  GITHUB_CALLBACK_URL: Joi.string().uri().optional().allow(''),

  // Railway
  RAILWAY_API_TOKEN: Joi.string().optional().allow(''),

  // Grafana
  GRAFANA_USER: Joi.string().default('admin'),
  GRAFANA_PASSWORD: Joi.string().default('admin'),
});
