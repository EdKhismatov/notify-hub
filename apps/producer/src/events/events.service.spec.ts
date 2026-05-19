import { OutboxEvent } from '@app/shared';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { InternalServerErrorException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';

describe('EventsService (producer)', () => {
  let service: EventsService;
  let amqpPublish: jest.Mock;
  let outboxModel: { create: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    amqpPublish = jest.fn().mockResolvedValue(undefined);

    outboxModel = {
      // create returns the row as if it were a sequelize instance
      create: jest.fn().mockImplementation(async (dto) => dto),
      update: jest.fn().mockResolvedValue([1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AmqpConnection, useValue: { publish: amqpPublish } },
        { provide: getModelToken(OutboxEvent), useValue: outboxModel },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('persists the event in the outbox before publishing', async () => {
    const callOrder: string[] = [];
    outboxModel.create.mockImplementation(async (dto) => {
      callOrder.push('create');
      return dto;
    });
    amqpPublish.mockImplementation(async () => {
      callOrder.push('publish');
    });

    await service.publishEvent({ type: 'order.created', payload: { id: 1 } });

    expect(callOrder).toEqual(['create', 'publish']);
    expect(outboxModel.create).toHaveBeenCalled();
  });

  it('marks the row as published on successful publish', async () => {
    const result = await service.publishEvent({ type: 'order.created', payload: {} });

    expect(amqpPublish).toHaveBeenCalledTimes(1);
    expect(outboxModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
      { where: { id: result.id } },
    );
  });

  it('generates a UUID id and ISO timestamp for every event', async () => {
    const result = await service.publishEvent({ type: 'a', payload: {} });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('uses event.id as AMQP messageId for idempotency', async () => {
    const result = await service.publishEvent({ type: 'a', payload: {} });

    expect(amqpPublish).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ id: result.id }),
      expect.objectContaining({ messageId: result.id, persistent: true }),
    );
  });

  it('keeps the row in pending status and surfaces an error when broker is down', async () => {
    amqpPublish.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.publishEvent({ type: 'x', payload: {} })).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(outboxModel.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', lastError: 'ECONNREFUSED' }),
      expect.objectContaining({ where: expect.any(Object) }),
    );
  });
});
