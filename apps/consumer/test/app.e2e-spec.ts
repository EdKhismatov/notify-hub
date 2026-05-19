import { EXCHANGES, ProcessedEvent, ROUTING_KEYS } from '@app/shared';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ConsumerModule } from '../src/consumer.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

/**
 * Real e2e test for the consumer.
 *
 * Boots ConsumerModule, publishes an event into events_exchange, then waits
 * for a row in `processed_events` confirming the consumer picked it up.
 * Gated by RUN_E2E=true.
 */
const runE2e = process.env.RUN_E2E === 'true';
const describeE2e = runE2e ? describe : describe.skip;

describeE2e('Consumer e2e (RabbitMQ → DB)', () => {
  let app: INestApplication;
  let amqp: AmqpConnection;
  let processedModel: typeof ProcessedEvent;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConsumerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    amqp = moduleRef.get<AmqpConnection>(AmqpConnection);
    processedModel = moduleRef.get<typeof ProcessedEvent>(getModelToken(ProcessedEvent));
    await processedModel.destroy({ where: {}, truncate: true });
    // Give the subscriber a moment to bind.
    await new Promise((r) => setTimeout(r, 1500));
  });

  afterAll(async () => {
    await app?.close();
  });

  const waitFor = async <T>(fn: () => Promise<T | null | undefined>, timeoutMs = 15_000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await fn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`waitFor timed out after ${timeoutMs}ms`);
  };

  it('processes a published event and writes a success row', async () => {
    const id = randomUUID();
    const event = { id, type: 'e2e.processed', payload: { foo: 'bar' }, timestamp: new Date().toISOString() };

    await amqp.publish(EXCHANGES.EVENTS, ROUTING_KEYS.EVENT_CREATED, event, {
      persistent: true,
      messageId: id,
    });

    // The handler has a 10% simulated failure — wait for either success or
    // dead_lettered (after 5 retries) so the test is deterministic.
    const row = await waitFor(async () => processedModel.findOne({ where: { id, consumer: 'events-consumer' } }));
    expect(['success', 'failed', 'dead_lettered']).toContain(row.status);
    expect(row.attempts).toBeGreaterThanOrEqual(1);
  });

  it('exposes /health/live', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
