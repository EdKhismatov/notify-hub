import { EXCHANGES, IEvent, ROUTING_KEYS } from '@app/shared';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  async publishEvent(createEventDto: CreateEventDto): Promise<IEvent> {
    const event: IEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: createEventDto.type,
      payload: createEventDto.payload || {},
    };

    try {
      this.logger.log(`Publishing event [${event.id}] of type [${event.type}]`);

      await this.amqpConnection.publish(EXCHANGES.EVENTS, ROUTING_KEYS.EVENT_CREATED, event, {
        persistent: true, // Обеспечиваем сохранность сообщения на диске в RabbitMQ
        messageId: event.id,
        timestamp: new Date(event.timestamp).getTime(),
      });

      this.logger.log(`Event [${event.id}] successfully published`);
      return event;
    } catch (error) {
      this.logger.error(`Failed to publish event [${event.id}]:`, error.stack);
      throw new InternalServerErrorException('Failed to publish event to RabbitMQ');
    }
  }
}
