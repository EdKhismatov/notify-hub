import type { IEvent, IEventHandler } from '@app/shared';
import { computeBackoffMs, EXCHANGES, MAX_RETRY_ATTEMPTS, ProcessedEvent, QUEUES, ROUTING_KEYS } from '@app/shared';
import { AmqpConnection, MessageHandlerErrorBehavior, Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { ConsumeMessage } from 'amqplib';
import { Telegraf } from 'telegraf';

const CONSUMER_NAME = 'telegram-notifier';

/**
 * Categorisation of Telegram Bot API errors:
 *
 *   • 'permanent' (4xx like 400/401/403) — the request itself is bad. Retrying
 *     is pointless; route straight to the DLQ.
 *   • 'rate_limited' (429) — wait the suggested `retry_after` then retry.
 *     We propagate this as a custom backoff value to the retry queue.
 *   • 'transient' (5xx, network, timeouts) — exponential backoff.
 */
type FailureKind = 'permanent' | 'rate_limited' | 'transient';

interface ClassifiedError {
  kind: FailureKind;
  message: string;
  retryAfterMs?: number;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy, IEventHandler {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private readonly chatId: string;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    @InjectModel(ProcessedEvent)
    private readonly processedModel: typeof ProcessedEvent,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';

    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set — notifications will not be sent');
    } else {
      this.bot = new Telegraf(token);
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.bot) return;
    try {
      const me = await this.bot.telegram.getMe();
      this.logger.log(`Telegram bot connected as @${me.username}`);
    } catch (error) {
      this.logger.error('Failed to connect to Telegram bot', error instanceof Error ? error.stack : error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('TelegramService shutting down …');
    if (this.bot) {
      // telegraf.stop() gracefully closes the polling connection (no-op when
      // webhooks / pure sendMessage mode is used, but safe to call either way).
      try {
        this.bot.stop('SIGTERM');
      } catch {
        // stop() may throw if the bot was never started — ignore.
      }
    }
    this.logger.log('TelegramService shut down cleanly');
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: '#',
    queue: QUEUES.NOTIFICATIONS,
    queueOptions: {
      durable: true,
      deadLetterExchange: EXCHANGES.DEAD_LETTER,
      deadLetterRoutingKey: '#',
    },
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(event: IEvent, amqpMsg?: ConsumeMessage): Promise<void | Nack> {
    if (!event?.id) {
      this.logger.warn('Received malformed event without id — dropping');
      return new Nack(false);
    }

    // Idempotency — was this notification already delivered?
    const existing = await this.processedModel.findOne({
      where: { id: event.id, consumer: CONSUMER_NAME },
    });
    if (existing?.status === 'success') {
      this.logger.log(`Notification for [${event.id}] already sent — skipping`);
      return undefined;
    }

    if (!this.bot || !this.chatId) {
      this.logger.warn(`Bot not configured — skipping event [${event.id}] (acked without delivery)`);
      return undefined;
    }

    const headerAttempts = Number(amqpMsg?.properties?.headers?.['x-attempts'] ?? 0);
    const dbAttempts = existing?.attempts ?? 0;
    const attempts = Math.max(dbAttempts, headerAttempts) + 1;

    try {
      const message = this.formatMessage(event);
      // eslint-disable-next-line camelcase
      await this.bot.telegram.sendMessage(this.chatId, message, { parse_mode: 'HTML' });

      await this.processedModel.upsert({
        id: event.id,
        consumer: CONSUMER_NAME,
        type: event.type,
        status: 'success',
        attempts,
        lastError: null,
        processedAt: new Date(),
      } as ProcessedEvent);

      this.logger.log(`Notification sent for event [${event.id}] (attempt ${attempts})`);
      return undefined;
    } catch (error) {
      const classified = this.classify(error);
      this.logger.error(
        `sendMessage failed for [${event.id}] kind=${classified.kind} attempt=${attempts}: ${classified.message}`,
      );

      // Permanent (4xx, malformed payload, blocked by user, …) — DLQ immediately.
      if (classified.kind === 'permanent') {
        await this.processedModel.upsert({
          id: event.id,
          consumer: CONSUMER_NAME,
          type: event.type,
          status: 'dead_lettered',
          attempts,
          lastError: classified.message,
          processedAt: null,
        } as ProcessedEvent);
        return new Nack(false);
      }

      // Transient/rate-limited — exhaust retries before DLQ.
      const terminal = attempts >= MAX_RETRY_ATTEMPTS;
      await this.processedModel.upsert({
        id: event.id,
        consumer: CONSUMER_NAME,
        type: event.type,
        status: terminal ? 'dead_lettered' : 'failed',
        attempts,
        lastError: classified.message,
        processedAt: null,
      } as ProcessedEvent);

      if (terminal) {
        this.logger.error(`Notification [${event.id}] exceeded ${MAX_RETRY_ATTEMPTS} attempts — DLQ`);
        return new Nack(false);
      }

      const delay = classified.retryAfterMs ?? computeBackoffMs(attempts);
      this.logger.warn(
        `Notification [${event.id}] scheduled for retry in ${delay}ms (attempt ${attempts}/${MAX_RETRY_ATTEMPTS})`,
      );

      await this.amqpConnection.publish(EXCHANGES.RETRY, ROUTING_KEYS.RETRY_NOTIFICATIONS, event, {
        persistent: true,
        messageId: event.id,
        expiration: String(delay),
        headers: {
          'x-attempts': attempts,
          'x-original-routing-key': ROUTING_KEYS.NOTIFICATION_SEND,
          'x-last-error': classified.message.slice(0, 500),
          'x-failure-kind': classified.kind,
        },
      });
      return undefined;
    }
  }

  /**
   * Map a Telegraf/Telegram error into a retry policy.
   * Telegraf surfaces the API response as `error.response.error_code` plus
   * `error.response.parameters.retry_after` for HTTP 429.
   */
  private classify(error: unknown): ClassifiedError {
    const err = error as {
      response?: { error_code?: number; description?: string; parameters?: { retry_after?: number } };
      code?: string;
      message?: string;
    };
    const message = err?.response?.description || err?.message || String(error);
    const code = err?.response?.error_code;

    if (code === 429) {
      const retryAfterSec = err.response?.parameters?.retry_after ?? 1;
      return { kind: 'rate_limited', message, retryAfterMs: retryAfterSec * 1000 };
    }

    if (typeof code === 'number' && code >= 400 && code < 500) {
      return { kind: 'permanent', message };
    }

    if (typeof code === 'number' && code >= 500) {
      return { kind: 'transient', message };
    }

    // Network/timeout errors carry no HTTP code — treat as transient.
    return { kind: 'transient', message };
  }

  private formatMessage(event: IEvent): string {
    const payloadStr = JSON.stringify(event.payload, null, 2);
    return `
🔔 <b>Новое событие!</b>

<b>Тип:</b> <code>${event.type}</code>
<b>ID:</b> <code>${event.id}</code>
<b>Время:</b> <code>${new Date(event.timestamp).toLocaleString()}</code>

<b>Данные:</b>
<pre>${payloadStr}</pre>
    `.trim();
  }
}
