import { OutboxEvent } from '@app/shared';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { ProducerModule } from '../src/producer.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

/**
 * Real e2e test for the producer.
 *
 * Requires Postgres and RabbitMQ to be reachable (see README — `docker compose
 * up postgres rabbitmq -d` or rely on the GitHub Actions service containers).
 *
 * Gated by `RUN_E2E=true` so a plain `npm test` stays fast and infra-free.
 */
const runE2e = process.env.RUN_E2E === 'true';
const describeE2e = runE2e ? describe : describe.skip;

describeE2e('Producer e2e (POST /events)', () => {
  let app: INestApplication;
  let outboxModel: typeof OutboxEvent;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ProducerModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    outboxModel = moduleRef.get<typeof OutboxEvent>(getModelToken(OutboxEvent));
    // Clean slate for each test run.
    await outboxModel.destroy({ where: {}, truncate: true });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects malformed payloads with 400', async () => {
    await request(app.getHttpServer())
      .post('/events')
      .send({ payload: { x: 1 } }) // missing `type`
      .expect(400);
  });

  it('persists the event to the outbox and returns 201 with the generated UUID', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({ type: 'e2e.smoke', payload: { run: 1 } })
      .expect(201);

    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.type).toBe('e2e.smoke');
    expect(response.body.payload).toEqual({ run: 1 });

    // Outbox row exists and is marked published (broker is reachable in e2e).
    const row = await outboxModel.findOne({ where: { id: response.body.id } });
    expect(row).not.toBeNull();
    if (!row) throw new Error('outbox row not found');
    expect(row.status).toBe('published');
    expect(row.publishedAt).toBeInstanceOf(Date);
  });

  it('exposes /health/live as a liveness probe', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('returns 200 from /health when broker and DB are reachable', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.info).toHaveProperty('rabbitmq');
    expect(response.body.info).toHaveProperty('postgres');
  });
});
