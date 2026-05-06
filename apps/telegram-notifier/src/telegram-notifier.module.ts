import { Module } from '@nestjs/common';
import { TelegramNotifierController } from './telegram-notifier.controller';
import { TelegramNotifierService } from './telegram-notifier.service';

@Module({
  imports: [],
  controllers: [TelegramNotifierController],
  providers: [TelegramNotifierService],
})
export class TelegramNotifierModule {}
