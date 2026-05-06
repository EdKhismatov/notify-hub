import type { IEvent } from '@app/shared';
import { EXCHANGES, IEventHandler, QUEUES } from '@app/shared';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { Telegraf } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit, IEventHandler {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;
  private readonly chatId: string;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';

    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set. Notifications will not be sent.');
    } else {
      this.bot = new Telegraf(token);
    }
  }

  async onModuleInit() {
    if (this.bot) {
      try {
        await this.bot.telegram.getMe();
        this.logger.log('Telegram bot successfully connected');
      } catch (error) {
        this.logger.error('Failed to connect to Telegram bot', error);
      }
    }
  }

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: '#',
    queue: QUEUES.NOTIFICATIONS,
  })
  async handle(event: IEvent, amqpMsg?: ConsumeMessage): Promise<void> {
    if (!event || !event.id) {
      return;
    }

    this.logger.log(`Received event [${event.id}] for notification.`);

    if (!this.bot || !this.chatId) {
      this.logger.warn('Bot not configured, skipping notification');
      return;
    }

    try {
      const message = this.formatMessage(event);
      await this.bot.telegram.sendMessage(this.chatId, message, {
        // eslint-disable-next-line camelcase
        parse_mode: 'HTML',
      });
      this.logger.log(`Notification sent for event [${event.id}]`);
    } catch (error) {
      this.logger.error(`Failed to send notification for event [${event.id}]:`, error);
      // Мы не делаем NACK здесь (чтобы не зацикливать при ошибках Telegram API),
      // но в реальном проекте можно добавить retry.
    }
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
