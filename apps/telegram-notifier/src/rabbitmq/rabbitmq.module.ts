import { EXCHANGES, QUEUES, ROUTING_KEYS } from '@app/shared';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';

/**
 * Topology owned by the telegram-notifier service.
 *
 *   events_exchange (topic) ─#─► notifications_queue
 *                                       │
 *                                    on Nack(false) ─► dead_letter_queue
 *                                       │
 *                                    via retry_exchange
 *                                       ▼
 *                          notifications_retry_queue (TTL = backoff)
 *                                       │
 *                              x-dead-letter back to events_exchange (notification.send)
 *                                       ▼
 *                              notifications_queue (re-delivery)
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [
        { name: EXCHANGES.EVENTS, type: 'topic' },
        { name: EXCHANGES.RETRY, type: 'topic' },
        { name: EXCHANGES.DEAD_LETTER, type: 'direct' },
      ],
      queues: [
        {
          name: QUEUES.NOTIFICATIONS,
          exchange: EXCHANGES.EVENTS,
          routingKey: '#',
          createQueueIfNotExists: true,
          options: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': EXCHANGES.DEAD_LETTER,
              'x-dead-letter-routing-key': '#',
            },
          },
        },
        {
          name: QUEUES.NOTIFICATIONS_RETRY,
          exchange: EXCHANGES.RETRY,
          routingKey: ROUTING_KEYS.RETRY_NOTIFICATIONS,
          createQueueIfNotExists: true,
          options: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': EXCHANGES.EVENTS,
              'x-dead-letter-routing-key': ROUTING_KEYS.NOTIFICATION_SEND,
            },
          },
        },
      ],
      uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      connectionInitOptions: { wait: false },
      prefetchCount: 1,
      enableControllerDiscovery: true,
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
