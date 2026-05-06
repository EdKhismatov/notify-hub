import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [RabbitmqModule],
  providers: [TelegramService],
})
export class TelegramModule {}
