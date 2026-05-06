import { Module } from '@nestjs/common';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [TelegramModule, RabbitmqModule],
  controllers: [],
  providers: [],
})
export class TelegramNotifierModule {}
