import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { EventsService } from './events.service';

@Module({
  imports: [RabbitmqModule],
  providers: [EventsService],
})
export class EventsModule {}
