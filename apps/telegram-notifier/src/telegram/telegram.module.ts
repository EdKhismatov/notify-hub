import { DatabaseModule, ProcessedEvent } from '@app/shared';
import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [DatabaseModule.forRoot({ models: [ProcessedEvent] }), RabbitmqModule],
  providers: [TelegramService],
})
export class TelegramModule {}
