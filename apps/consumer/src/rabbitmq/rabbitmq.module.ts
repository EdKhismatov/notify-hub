import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGES, QUEUES } from '@app/shared';

@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [
        {
          name: EXCHANGES.EVENTS,
          type: 'topic',
        },
        {
          name: EXCHANGES.DEAD_LETTER,
          type: 'direct',
        },
      ],
      queues: [
        {
          name: QUEUES.DEAD_LETTER,
          exchange: EXCHANGES.DEAD_LETTER,
          routingKey: '#',
        },
      ],
      uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      connectionInitOptions: { wait: false },
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
