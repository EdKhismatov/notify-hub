import { EXCHANGES, QUEUES } from '@app/shared';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [
        {
          name: EXCHANGES.EVENTS,
          type: 'topic',
        },
      ],
      queues: [
        {
          name: QUEUES.NOTIFICATIONS,
          exchange: EXCHANGES.EVENTS,
          routingKey: '#', // Подписываемся на все события из exchange
        },
      ],
      uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      connectionInitOptions: { wait: false },
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
