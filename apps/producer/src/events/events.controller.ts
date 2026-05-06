import { EventDto } from '@app/shared';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a new event to RabbitMQ' })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The event has been successfully published.',
    type: EventDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data.' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'RabbitMQ connection error.' })
  async publishEvent(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.publishEvent(createEventDto);
  }
}
