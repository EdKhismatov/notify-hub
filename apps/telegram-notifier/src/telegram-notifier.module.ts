import { HealthModule } from '@app/shared';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), TelegramModule, RabbitmqModule, HealthModule],
})
export class TelegramNotifierModule {}
