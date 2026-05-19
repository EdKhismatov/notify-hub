import { DynamicModule, Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ModelCtor } from 'sequelize-typescript';

/**
 * Shared database module — wires Sequelize with PostgreSQL using env vars.
 * Each service (producer, consumer, telegram-notifier) registers only the
 * models it needs by passing them via `forRoot({ models })`.
 *
 * Marked `@Global` so `Sequelize` (used by Terminus' SequelizeHealthIndicator)
 * is reachable from `HealthModule` without re-importing.
 *
 * `synchronize: true` (autoLoadModels + synchronize) is convenient for the
 * assignment but should be replaced with proper migrations in production.
 */
export interface DatabaseModuleOptions {
  models: ModelCtor[];
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      imports: [
        SequelizeModule.forRoot({
          dialect: 'postgres',
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
          username: process.env.POSTGRES_USER || 'notify',
          password: process.env.POSTGRES_PASSWORD || 'notify',
          database: process.env.POSTGRES_DB || 'notify_hub',
          models: options.models,
          autoLoadModels: true,
          synchronize: true,
          logging: process.env.DB_LOGGING === 'true' ? console.log : false,
          retryAttempts: 20,
          retryDelay: 3000,
        }),
        SequelizeModule.forFeature(options.models),
      ],
      exports: [SequelizeModule],
    };
  }
}
