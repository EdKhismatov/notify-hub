import { ProcessedEvent } from '@app/shared';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';

describe('EventsService (consumer)', () => {
  let service: EventsService;
  let amqpPublish: jest.Mock;
  let processedModel: { findOne: jest.Mock; upsert: jest.Mock };

  const baseEvent = {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'order.created',
    payload: { foo: 'bar' },
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    amqpPublish = jest.fn().mockResolvedValue(undefined);
    processedModel = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue([{}, true]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: AmqpConnection, useValue: { publish: amqpPublish } },
        { provide: getModelToken(ProcessedEvent), useValue: processedModel },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    // Stop the simulated 10% failure from contaminating happy-path tests.
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips events that were already processed successfully', async () => {
    processedModel.findOne.mockResolvedValueOnce({
      id: baseEvent.id,
      consumer: 'events-consumer',
      type: baseEvent.type,
      status: 'success',
      attempts: 1,
      lastError: null,
      processedAt: new Date(),
    });

    const result = await service.handle(baseEvent);

    expect(result).toBeUndefined(); // ack
    expect(processedModel.upsert).not.toHaveBeenCalled();
    expect(amqpPublish).not.toHaveBeenCalled();
  });

  it('rejects malformed events to the DLQ', async () => {
    const result = await service.handle({ id: '', type: '', payload: {}, timestamp: '' });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  it('marks the event as success on happy path', async () => {
    await service.handle(baseEvent);

    expect(processedModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: baseEvent.id, status: 'success', attempts: 1 }),
    );
    expect(amqpPublish).not.toHaveBeenCalled();
  });

  it('publishes to retry exchange with exponential backoff TTL on failure', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // force simulated failure

    await service.handle(baseEvent);

    expect(amqpPublish).toHaveBeenCalledWith(
      'retry_exchange',
      'retry.events',
      baseEvent,
      expect.objectContaining({
        expiration: expect.any(String),
        headers: expect.objectContaining({ 'x-attempts': 1 }),
      }),
    );
    expect(processedModel.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', attempts: 1 }));
  });

  it('sends to DLQ once max attempts is reached', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    processedModel.findOne.mockResolvedValueOnce({
      id: baseEvent.id,
      consumer: 'events-consumer',
      type: baseEvent.type,
      status: 'failed',
      attempts: 4, // next attempt will be 5 == MAX_RETRY_ATTEMPTS
      lastError: 'previous failure',
      processedAt: null,
    });

    const result = await service.handle(baseEvent);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqpPublish).not.toHaveBeenCalled();
    expect(processedModel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'dead_lettered', attempts: 5 }),
    );
  });
});
