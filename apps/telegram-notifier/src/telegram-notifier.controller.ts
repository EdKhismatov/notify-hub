import { Controller, Get } from '@nestjs/common';
import { TelegramNotifierService } from './telegram-notifier.service';

@Controller()
export class TelegramNotifierController {
  constructor(private readonly telegramNotifierService: TelegramNotifierService) {}

  @Get()
  getHello(): string {
    return this.telegramNotifierService.getHello();
  }
}
