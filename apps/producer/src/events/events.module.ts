import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RabbitmqModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
