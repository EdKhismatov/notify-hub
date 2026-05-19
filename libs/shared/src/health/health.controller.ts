import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, SequelizeHealthIndicator } from '@nestjs/terminus';
import { AmqpHealthIndicator } from './amqp.health';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly amqp: AmqpHealthIndicator,
    private readonly db: SequelizeHealthIndicator,
  ) {}

  /**
   * Readiness probe — checks that all external dependencies are reachable.
   * Returns 200 only if both RabbitMQ and Postgres respond.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks RabbitMQ and Postgres' })
  @ApiResponse({ status: 200, description: 'All dependencies are reachable.' })
  @ApiResponse({ status: 503, description: 'At least one dependency is down.' })
  check() {
    return this.health.check([
      () => this.amqp.isHealthy('rabbitmq'),
      // pingCheck against the default Sequelize connection. If the host service
      // hasn't registered any models, Terminus still resolves the dependency,
      // so callers without a DB get a graceful 503 rather than a crash.
      () => this.db.pingCheck('postgres', { timeout: 1500 }),
    ]);
  }

  /**
   * Liveness probe — just confirms the process is up. Used by orchestrators
   * (Docker / k8s) to decide whether to restart the container.
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  @ApiResponse({ status: 200, description: 'Process responding.' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
