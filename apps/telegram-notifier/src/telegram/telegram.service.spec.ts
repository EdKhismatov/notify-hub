import { ProcessedEvent } from '@app/shared';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let amqpPublish: jest.Mock;
  let processedModel: { findOne: jest.Mock; upsert: jest.Mock };
  let sendMessage: jest.Mock;

  const event = {
    id: '22222222-2222-2222-2222-222222222222',
    type: 'order.paid',
    payload: { amount: 100 },
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'fake:token';
    process.env.TELEGRAM_CHAT_ID = '123';

    sendMessage = jest.fn().mockResolvedValue(undefined);
    amqpPublish = jest.fn().mockResolvedValue(undefined);
    processedModel = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue([{}, true]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: AmqpConnection, useValue: { publish: amqpPublish } },
        { provide: getModelToken(ProcessedEvent), useValue: processedModel },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    // Stub the bot so we control sendMessage outcomes.
    (service as unknown as { bot: { telegram: { sendMessage: jest.Mock } } }).bot = {
      telegram: { sendMessage },
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips already-delivered notifications', async () => {
    processedModel.findOne.mockResolvedValueOnce({
      id: event.id,
      consumer: 'telegram-notifier',
      type: event.type,
      status: 'success',
      attempts: 1,
      lastError: null,
      processedAt: new Date(),
    });

    await service.handle(event);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends the message and marks success on happy path', async () => {
    await service.handle(event);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(processedModel.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', attempts: 1 }));
  });

  it('routes 4xx errors straight to DLQ without retry', async () => {
    sendMessage.mockRejectedValueOnce({
      // eslint-disable-next-line camelcase
      response: { error_code: 400, description: 'Bad Request' },
    });

    const result = await service.handle(event);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(amqpPublish).not.toHaveBeenCalled();
    expect(processedModel.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'dead_lettered' }));
  });

  it('honors retry_after on 429 and uses it as TTL', async () => {
    sendMessage.mockRejectedValueOnce({
      // eslint-disable-next-line camelcase
      response: { error_code: 429, description: 'Too Many', parameters: { retry_after: 7 } },
    });

    await service.handle(event);

    expect(amqpPublish).toHaveBeenCalledWith(
      'retry_exchange',
      'retry.notifications',
      event,
      expect.objectContaining({
        expiration: '7000',
        headers: expect.objectContaining({ 'x-failure-kind': 'rate_limited' }),
      }),
    );
  });

  it('uses exponential backoff for transient (5xx) errors', async () => {
    sendMessage.mockRejectedValueOnce({
      // eslint-disable-next-line camelcase
      response: { error_code: 502, description: 'Bad Gateway' },
    });

    await service.handle(event);

    expect(amqpPublish).toHaveBeenCalledWith(
      'retry_exchange',
      'retry.notifications',
      event,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-failure-kind': 'transient', 'x-attempts': 1 }),
      }),
    );
  });

  it('treats network errors (no http code) as transient', async () => {
    sendMessage.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await service.handle(event);

    expect(amqpPublish).toHaveBeenCalledWith(
      'retry_exchange',
      'retry.notifications',
      event,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-failure-kind': 'transient' }),
      }),
    );
  });
});
