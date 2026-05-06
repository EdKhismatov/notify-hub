import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class EventDto {
  @ApiProperty({
    description: 'Unique event identifier (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

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
  payload: Record<string, any>;

  @ApiProperty({
    description: 'ISO 8601 timestamp of the event',
    example: '2025-01-01T12:00:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  timestamp: string;
}
