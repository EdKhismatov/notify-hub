import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramNotifierModule } from '../src/telegram-notifier.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

/**
 * Lightweight e2e for the telegram-notifier.
 *
 * The full flow (publish → telegram API call) requires real Telegram
 * credentials and is therefore covered by unit tests. This e2e verifies
 * that the service boots against real Postgres + RabbitMQ and exposes
 * its health endpoints.
 *
 * Gated by RUN_E2E=true.
 */
const runE2e = process.env.RUN_E2E === 'true';
const describeE2e = runE2e ? describe : describe.skip;

describeE2e('Telegram-notifier e2e (boot + health)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TelegramNotifierModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes /health/live', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports broker + DB connectivity via /health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
});
