import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack, MessageHandlerErrorBehavior } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGES, QUEUES, ROUTING_KEYS, IEventHandler } from '@app/shared';
import type { IEvent } from '@app/shared';
import type { ConsumeMessage } from 'amqplib';

@Injectable()
export class EventsService implements IEventHandler {
  private readonly logger = new Logger(EventsService.name);
  
  // Простейшая in-memory база для проверки идемпотентности.
  // В реальном проекте здесь должен быть Redis или БД.
  private readonly processedEvents = new Set<string>();

  @RabbitSubscribe({
    exchange: EXCHANGES.EVENTS,
    routingKey: ROUTING_KEYS.EVENT_CREATED,
    queue: QUEUES.EVENTS,
    queueOptions: {
      deadLetterExchange: EXCHANGES.DEAD_LETTER,
      deadLetterRoutingKey: '#',
    },
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(event: IEvent, amqpMsg?: ConsumeMessage): Promise<void | Nack> {
    if (!event || !event.id) {
      this.logger.warn('Received invalid event, rejecting.');
      return; // return Nack? No, just let it process as void or return a Nack.
    }

    try {
      this.logger.log(`Received event [${event.id}] of type [${event.type}]`);

      // 1. Проверка на идемпотентность
      if (this.processedEvents.has(event.id)) {
        this.logger.log(`Event [${event.id}] was already processed. Skipping.`);
        // Возвращаем ничего, это работает как успешный ACK в библиотеке
        return;
      }

      // 2. Имитация обработки (например, сохранение в БД)
      await this.processBusinessLogic(event);

      // 3. Отмечаем как обработанное
      this.processedEvents.add(event.id);
      
      // Очистка старых событий из памяти (простая сборка мусора для in-memory)
      if (this.processedEvents.size > 10000) {
        this.processedEvents.clear();
      }

      this.logger.log(`Event [${event.id}] processed successfully.`);
      
      // Библиотека сделает ACK автоматически при успешном завершении функции
    } catch (error) {
      this.logger.error(`Error processing event [${event.id}]: ${error.message}`, error.stack);
      
      // Проверяем количество попыток (добавим x-retry-count)
      const headers = amqpMsg?.properties?.headers || {};
      const retryCount = (headers['x-retry-count'] || 0) + 1;
      
      if (retryCount >= 3) {
        this.logger.error(`Event [${event.id}] failed 3 times. Sending to DLQ.`);
        // Возврат Nack(false) делает reject и не возвращает в очередь (улетает в DLQ)
        return new Nack(false);
      }
      
      this.logger.warn(`Requeueing event [${event.id}]. Attempt ${retryCount}`);
      // Здесь можно использовать отдельный механизм задержки или DLQ-роутинга для retry
      // Для простоты, возвращаем Nack(true) для возврата в начало очереди
      return new Nack(true);
    }
  }

  private async processBusinessLogic(event: IEvent): Promise<void> {
    // Эмуляция случайной ошибки для демонстрации Retry/DLQ (10% шанс)
    if (Math.random() < 0.1) {
      throw new Error('Simulated random processing failure');
    }
    
    // Эмуляция долгой работы
    return new Promise((resolve) => setTimeout(resolve, 100));
  }
}
