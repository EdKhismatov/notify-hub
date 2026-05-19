import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

/**
 * Custom Terminus indicator for the RabbitMQ connection managed by
 * `@golevelup/nestjs-rabbitmq`. Reports `up` only when the underlying
 * connection is currently established.
 */
@Injectable()
export class AmqpHealthIndicator extends HealthIndicator {
  constructor(private readonly amqp: AmqpConnection) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isConnected = Boolean(this.amqp?.connected);
    const result = this.getStatus(key, isConnected, {
      connected: isConnected,
    });

    if (isConnected) return result;
    throw new HealthCheckError('RabbitMQ connection is down', result);
  }
}
