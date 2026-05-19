import { DatabaseModule, OutboxEvent } from '@app/shared';
import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [DatabaseModule.forRoot({ models: [OutboxEvent] }), RabbitmqModule],
  controllers: [EventsController],
  providers: [EventsService, OutboxRelayService],
})
export class EventsModule {}
