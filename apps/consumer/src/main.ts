import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConsumerModule } from './consumer.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(ConsumerModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const port = process.env.CONSUMER_PORT ?? 3002;
  await app.listen(port);

  logger.log(`Consumer is running on: http://localhost:${port}`);
}

bootstrap();
