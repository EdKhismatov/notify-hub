import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitmqModule],
  providers: [TelegramService],
})
export class TelegramModule {}
