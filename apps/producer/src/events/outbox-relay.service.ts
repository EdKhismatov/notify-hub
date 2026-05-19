import { IEvent, OutboxEvent } from '@app/shared';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { EventsService } from './events.service';

/**
 * Outbox relay — periodically scans the outbox for `pending` rows and tries
 * to republish them. This is the safety net that turns the producer into a
 * truly reliable publisher: even if RabbitMQ was down when the API call came
 * in, or the synchronous publish failed for any reason, the event will be
 * published as soon as the broker is reachable again.
 *
 * Backoff is implicit: rows updated in the last 10 seconds are skipped to
 * avoid tight retry loops; older rows are picked up on every tick.
 */
@Injectable()
export class OutboxRelayService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRunning = false;

  /**
   * Resolves when the currently-active relay tick finishes (or immediately if
   * idle). Checked during shutdown so we don't kill a mid-flight DB/broker call.
   */
  private currentTick: Promise<void> = Promise.resolve();

  /** Hard cap on attempts before marking a row as terminally failed. */
  private static readonly MAX_ATTEMPTS = 10;

  /** Quiet period after each attempt before the row is reconsidered. */
  private static readonly RETRY_QUIET_MS = 10_000;

  /** Max rows to process per tick. */
  private static readonly BATCH_SIZE = 50;

  constructor(
    @InjectModel(OutboxEvent)
    private readonly outboxModel: typeof OutboxEvent,
    private readonly eventsService: EventsService,
  ) {}

  /** Called by NestJS before the process exits. Waits for the active tick. */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('OutboxRelayService shutting down — waiting for active relay tick to finish …');
    await this.currentTick;
    this.logger.log('OutboxRelayService shut down cleanly');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  relay(): void {
    // Re-entrancy guard: if the previous tick is still running (e.g. broker is
    // slow), skip this one rather than pile up parallel batches.
    if (this.isRunning) return;

    // Track the promise so onModuleDestroy can await it.
    this.currentTick = this.runRelay();
  }

  private async runRelay(): Promise<void> {
    this.isRunning = true;

    try {
      const cutoff = new Date(Date.now() - OutboxRelayService.RETRY_QUIET_MS);
      const pending = await this.outboxModel.findAll({
        where: {
          status: 'pending',
          updatedAt: { [Op.lt]: cutoff },
        },
        order: [['createdAt', 'ASC']],
        limit: OutboxRelayService.BATCH_SIZE,
      });

      if (pending.length === 0) return;

      this.logger.log(`Relaying ${pending.length} pending event(s)`);

      for (const row of pending) {
        await this.relayOne(row);
      }
    } catch (err) {
      this.logger.error(`Relay tick failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async relayOne(row: OutboxEvent): Promise<void> {
    const event: IEvent = {
      id: row.id,
      type: row.type,
      payload: row.payload,
      timestamp: row.timestamp.toISOString(),
    };

    try {
      await this.eventsService.publishToBroker(event);
      await this.eventsService.markPublished(row.id);
      this.logger.log(`Relayed event [${row.id}] (was attempt ${row.attempts + 1})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newAttempts = row.attempts + 1;

      if (newAttempts >= OutboxRelayService.MAX_ATTEMPTS) {
        await this.outboxModel.update(
          { status: 'failed', attempts: newAttempts, lastError: message },
          { where: { id: row.id } },
        );
        this.logger.error(`Event [${row.id}] permanently failed after ${newAttempts} attempts: ${message}`);
      } else {
        await this.outboxModel.update({ attempts: newAttempts, lastError: message }, { where: { id: row.id } });
        this.logger.warn(`Relay attempt ${newAttempts} failed for [${row.id}]: ${message}`);
      }
    }
  }
}
