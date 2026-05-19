import type { IEvent, IEventHandler } from '@app/shared';
import { computeBackoffMs, EXCHANGES, MAX_RETRY_ATTEMPTS, ProcessedEvent, QUEUES, ROUTING_KEYS } from '@app/shared';
import { AmqpConnection, MessageHandlerErrorBehavior, Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { ConsumeMessage } from 'amqplib';

const CONSUMER_NAME = 'events-consumer';

/**
 * Consumer service.
 *
 *   • Idempotency: each (id, consumer) pair has a row in `processed_events`.
 *     A successful row blocks reprocessing on subsequent deliveries.
 *
 *   • Persistent retry counter: `attempts` in DB survives restarts and is
 *     also propagated through AMQP headers so the broker-driven backoff
 *     queue knows when to give up.
 *
 *   • Backoff: instead of immediately requeueing (which busy-loops the
 *     broker), failed messages are republished to the retry exchange where
 *     they sit in `events_retry_queue` for `computeBackoffMs(attempts)` ms,
 *     then automatically flow back to the main exchange via x-dead-letter.
 */
@Injectable()
export class EventsService implements IEventHandler {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    @InjectModel(ProcessedEvent)
    private readonly processedModel: typeof ProcessedEvent,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.EVENT_CREATED,
    queue: QUEUES.EVENTS,
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGES.DEAD_LETTER,
      deadLetterRoutingKey: '#',
    },
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(event: IEvent, amqpMsg?: ConsumeMessage): Promise<void | Nack> {
    if (!event?.id) {
      this.logger.warn('Received malformed event without id — dropping to DLQ');
      return new Nack(false);
    }

    // 1. Idempotency check — has this exact event already been processed?
    const existing = await this.processedModel.findOne({
      where: { id: event.id, consumer: CONSUMER_NAME },
    });

    if (existing?.status === 'success') {
      this.logger.log(`Event [${event.id}] already processed at ${existing.processedAt?.toISOString()} — skipping`);
      return undefined; // ACK
    }

    // 2. Read current attempt count from DB (preferred) or AMQP header (fallback).
    const headerAttempts = Number(amqpMsg?.properties?.headers?.['x-attempts'] ?? 0);
    const dbAttempts = existing?.attempts ?? 0;
    const attempts = Math.max(dbAttempts, headerAttempts) + 1;

    try {
      this.logger.log(`Processing event [${event.id}] type=${event.type} attempt=${attempts}`);
      await this.processBusinessLogic(event);

      // 3. Mark as successfully processed (upsert).
      await this.processedModel.upsert({
        id: event.id,
        consumer: CONSUMER_NAME,
        type: event.type,
        status: 'success',
        attempts,
        lastError: null,
        processedAt: new Date(),
      } as ProcessedEvent);

      this.logger.log(`Event [${event.id}] processed successfully`);
      return undefined; // ACK
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Event [${event.id}] processing failed (attempt ${attempts}): ${message}`);

      // 4. Persist failure state.
      const terminal = attempts >= MAX_RETRY_ATTEMPTS;
      await this.processedModel.upsert({
        id: event.id,
        consumer: CONSUMER_NAME,
        type: event.type,
        status: terminal ? 'dead_lettered' : 'failed',
        attempts,
        lastError: message,
        processedAt: null,
      } as ProcessedEvent);

      if (terminal) {
        this.logger.error(`Event [${event.id}] exceeded ${MAX_RETRY_ATTEMPTS} attempts — sending to DLQ`);
        return new Nack(false); // reject without requeue → DLX → DLQ
      }

      // 5. Send to retry exchange with TTL = backoff. The retry queue will
      //    dead-letter it back into events_exchange after the delay.
      const delay = computeBackoffMs(attempts);
      this.logger.warn(`Event [${event.id}] will be retried in ${delay}ms (attempt ${attempts}/${MAX_RETRY_ATTEMPTS})`);

      await this.amqpConnection.publish(EXCHANGES.RETRY, ROUTING_KEYS.RETRY_EVENTS, event, {
        persistent: true,
        messageId: event.id,
        expiration: String(delay),
        headers: {
          'x-attempts': attempts,
          'x-original-routing-key': ROUTING_KEYS.EVENT_CREATED,
          'x-last-error': message.slice(0, 500),
        },
      });

      // ACK the original delivery — the message lives on in the retry queue.
      return undefined;
    }
  }

  /**
   * Stand-in for real business logic. Throws ~10% of the time so the
   * retry/DLQ pipeline can be observed in development.
   */
  private async processBusinessLogic(event: IEvent): Promise<void> {
    if (Math.random() < 0.1) {
      throw new Error(`Simulated processing failure for event ${event.id}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
