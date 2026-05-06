import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitmqModule],
  providers: [EventsService],
})
export class EventsModule {}
