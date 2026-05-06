import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { TelegramNotifierModule } from './telegram-notifier.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(TelegramNotifierModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const port = process.env.NOTIFIER_PORT ?? 3003;
  await app.listen(port);
  
  logger.log(`Telegram Notifier is running on: http://localhost:${port}`);
}

bootstrap();
