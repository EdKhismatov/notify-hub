import { DatabaseModule, ProcessedEvent } from '@app/shared';
import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { EventsService } from './events.service';

@Module({
  imports: [DatabaseModule.forRoot({ models: [ProcessedEvent] }), RabbitmqModule],
  providers: [EventsService],
})
export class EventsModule {}
