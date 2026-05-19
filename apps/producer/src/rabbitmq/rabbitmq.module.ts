import { EXCHANGES } from '@app/shared';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';

/**
 * Producer side only needs to publish; topology of consumer-owned queues is
 * declared by their respective services. We still declare the events exchange
 * to make the producer self-sufficient if it boots before the consumers.
 *
 * **Publisher confirms.**
 *   `@golevelup/nestjs-rabbitmq` creates every channel (named or default) as
 *   an `amqplib` `ConfirmChannel` — confirms are always on. That's why
 *   `await amqpConnection.publish(...)` only resolves once the broker has
 *   sent a `basic.ack` for the message; if the broker rejects or the channel
 *   closes, the promise rejects and our outbox row stays `pending`, which is
 *   exactly the behavior the `OutboxRelayService` relies on.
 *
 *   The named `producer-confirm-channel` below makes the confirm channel
 *   explicit (and gives us a place to scope `prefetchCount` / future tweaks)
 *   even though confirms would still be active without it.
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRoot({
      exchanges: [{ name: EXCHANGES.EVENTS, type: 'topic' }],
      uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      connectionInitOptions: { wait: false },
      enableControllerDiscovery: false,
      defaultExchangeType: 'topic',
      channels: {
        'producer-confirm-channel': {
          // Mark as the default channel so every `amqpConnection.publish()`
          // routes through it and benefits from publisher confirms.
          default: true,
          prefetchCount: 1,
        },
      },
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
