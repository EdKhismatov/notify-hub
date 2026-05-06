import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [EventsModule, RabbitmqModule],
  controllers: [],
  providers: [],
})
export class ProducerModule {}
