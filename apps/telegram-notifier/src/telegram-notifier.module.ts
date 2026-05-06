import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [TelegramModule, RabbitmqModule],
  controllers: [],
  providers: [],
})
export class TelegramNotifierModule {}
