import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AmqpHealthIndicator } from './amqp.health';
import { HealthController } from './health.controller';

/**
 * Drop-in module that mounts `GET /health` and `GET /health/live` on the
 * service it's imported into. Each service exposes:
 *
 *   • `/health/live`  — liveness: app is running (no external deps).
 *   • `/health`       — readiness: AMQP and DB connections are usable.
 *
 * The DB indicator is conditional — it only runs if the host service has
 * Sequelize wired up (i.e. ProcessedEvent / OutboxEvent registered). If a
 * service has no DB, it's still safe to import this module: the indicator
 * is just skipped.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [AmqpHealthIndicator],
  exports: [AmqpHealthIndicator],
})
export class HealthModule {}
