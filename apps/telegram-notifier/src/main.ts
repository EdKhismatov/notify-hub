import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TelegramNotifierModule } from './telegram-notifier.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(TelegramNotifierModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Enable NestJS lifecycle hooks (OnModuleDestroy, BeforeApplicationShutdown, etc.)
  app.enableShutdownHooks();

  const port = process.env.NOTIFIER_PORT ?? 3003;
  await app.listen(port);

  logger.log(`Telegram Notifier is running on: http://localhost:${port}`);

  // Force-exit after 30 s if graceful shutdown hangs (e.g. waiting for Telegram API).
  const forceExitMs = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 30_000);
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal} — shutting down gracefully (timeout ${forceExitMs}ms) …`);
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, forceExitMs);
    timer.unref();
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
