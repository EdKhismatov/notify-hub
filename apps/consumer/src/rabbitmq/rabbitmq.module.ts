import { EXCHANGES, QUEUES, ROUTING_KEYS } from '@app/shared';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';

/**
 * Topology owned by the consumer service.
 *
 *   events_exchange (topic)  ──event.created──►  events_queue
 *                                                     │
 *                                                  on Nack
 *                                                     ▼
 *                                          dead_letter_exchange
 *                                                     │
 *                                                     ▼
 *                                          dead_letter_queue   (terminal failures)
 *
 *                                                or
 *
 *                                          retry_exchange ──retry.events──► events_retry_queue
 *                                                                              │  (TTL = backoff)
 *                                                                              ▼ on expiry
 *                                                                       events_exchange (re-delivery)
 *
 * The retry queue uses x-message-ttl + x-dead-letter-exchange so that messages
 * automatically flow back into the main exchange after the backoff elapses —
 * this is the standard "delayed retry" pattern in RabbitMQ that does not
 * require the rabbitmq_delayed_message_exchange plugin.
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
          name: QUEUES.EVENTS_RETRY,
          exchange: EXCHANGES.RETRY,
          routingKey: ROUTING_KEYS.RETRY_EVENTS,
          createQueueIfNotExists: true,
          options: {
            durable: true,
            arguments: {
              // After TTL expires, dead-letter back to the main events exchange
              // with the original routing key so the consumer picks it up again.
              'x-dead-letter-exchange': EXCHANGES.EVENTS,
              'x-dead-letter-routing-key': ROUTING_KEYS.EVENT_CREATED,
            },
          },
        },
        {
          name: QUEUES.DEAD_LETTER,
          exchange: EXCHANGES.DEAD_LETTER,
          routingKey: '#',
          createQueueIfNotExists: true,
          options: { durable: true },
        },
      ],
      uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      connectionInitOptions: { wait: false },
      // Process one message at a time so backoff doesn't block prefetched batches.
      prefetchCount: 1,
      enableControllerDiscovery: true,
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
