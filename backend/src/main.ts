import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './observability/sentry-exception.filter';
import { SentryService } from './observability/sentry.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get Sentry service and apply global exception filter
  const sentryService = app.get(SentryService);
  app.useGlobalFilters(new SentryExceptionFilter(sentryService));

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required for Swagger UI
            "'unsafe-eval'", // Required for Swagger UI
          ],
          styleSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", process.env.FRONTEND_URL, 'ws://localhost:*', 'wss://*'].filter(
            Boolean,
          ) as string[],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'self'", 'http://localhost:*', 'https://localhost:*'], // Allow localhost for preview iframe
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for API server
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin requests
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('FuzzyLlama API')
    .setDescription('FuzzyLlama multi-agent application builder API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = app.get('winston');
  logger.info(`🚀 Backend API running on http://localhost:${port}`);
  logger.info(`📚 API Documentation available at http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
