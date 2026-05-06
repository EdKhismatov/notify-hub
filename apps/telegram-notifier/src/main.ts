import { NestFactory } from '@nestjs/core';
import { TelegramNotifierModule } from './telegram-notifier.module';

async function bootstrap() {
  const app = await NestFactory.create(TelegramNotifierModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
