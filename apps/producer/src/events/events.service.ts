import { EXCHANGES, IEvent, OutboxEvent, ROUTING_KEYS } from '@app/shared';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { literal } from 'sequelize';
import { CreateEventDto } from './dto/create-event.dto';

/**
 * Producer service implementing the simplified Transactional Outbox pattern:
 *
 *   1. Persist the event to `outbox_events` with status='pending'.
 *   2. Try to publish to RabbitMQ (publisher-confirm channel awaits broker ack).
 *   3. On success — mark row 'published'.
 *   4. On failure — leave it 'pending'; OutboxRelayService will retry it.
 *
 * This guarantees at-least-once delivery: even if RabbitMQ is down at the
 * moment of the API call, the event will eventually be published.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    @InjectModel(OutboxEvent)
    private readonly outboxModel: typeof OutboxEvent,
  ) {}

  async publishEvent(createEventDto: CreateEventDto): Promise<IEvent> {
    const id = randomUUID();
    const timestamp = new Date();

    // 1. Persist to outbox first — this is the source of truth.
    const row = await this.outboxModel.create({
      id,
      type: createEventDto.type,
      payload: createEventDto.payload || {},
      timestamp,
      status: 'pending',
      attempts: 0,
    } as OutboxEvent);

    const event: IEvent = {
      id: row.id,
      type: row.type,
      payload: row.payload,
      timestamp: row.timestamp.toISOString(),
    };

    // 2. Try to publish synchronously so the API caller gets immediate feedback
    //    on broker availability. If this fails, the OutboxRelay will retry.
    try {
      await this.publishToBroker(event);
      await this.markPublished(row.id);
      this.logger.log(`Event [${event.id}] published`);
      return event;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.outboxModel.update(
        { attempts: literal('attempts + 1'), lastError: message, status: 'pending' },
        { where: { id: row.id } },
      );
      this.logger.error(`Event [${event.id}] failed to publish synchronously, will be retried by relay: ${message}`);
      throw new InternalServerErrorException(
        'Event was persisted but broker is unavailable; it will be retried automatically.',
      );
    }
  }

  /**
   * Publish a single event to the broker. Used both by the synchronous path
   * above and by the OutboxRelayService.
   */
  async publishToBroker(event: IEvent): Promise<void> {
    await this.amqpConnection.publish(EXCHANGES.EVENTS, ROUTING_KEYS.EVENT_CREATED, event, {
      persistent: true,
      messageId: event.id,
      timestamp: new Date(event.timestamp).getTime(),
      contentType: 'application/json',
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.outboxModel.update({ status: 'published', publishedAt: new Date() }, { where: { id } });
  }
}
