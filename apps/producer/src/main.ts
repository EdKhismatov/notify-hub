import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ProducerModule } from './producer.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(ProducerModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Enable NestJS lifecycle hooks (OnModuleDestroy, BeforeApplicationShutdown, etc.)
  app.enableShutdownHooks();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Producer API')
    .setDescription('Event publishing service — sends events to RabbitMQ')
    .setVersion('1.0')
    .addTag('events', 'Event management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PRODUCER_PORT ?? 3001;
  await app.listen(port);

  logger.log(`Producer is running on: http://localhost:${port}`);
  logger.log(`Swagger UI: http://localhost:${port}/api`);

  // Force-exit after 30 s if graceful shutdown hangs (e.g. broker unreachable).
  const forceExitMs = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 30_000);
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal} — shutting down gracefully (timeout ${forceExitMs}ms) …`);
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, forceExitMs);
    timer.unref(); // Don't keep the event loop alive just for this timer.
    try {
      await app.close();
      logger.log('Application closed cleanly');
    } catch (err) {
      logger.error('Error during shutdown', err instanceof Error ? err.stack : err);
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err: unknown) => logger.error('Shutdown error', err));
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err: unknown) => logger.error('Shutdown error', err));
  });
}

bootstrap();
