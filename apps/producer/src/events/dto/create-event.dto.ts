import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({
    description: 'Event type in dot notation',
    example: 'payment.created',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({
    description: 'Arbitrary event payload',
    example: { amount: 100, currency: 'USD', userId: 'user-123' },
  })
  @IsObject()
  @IsOptional()
  payload?: Record<string, any>;
}
