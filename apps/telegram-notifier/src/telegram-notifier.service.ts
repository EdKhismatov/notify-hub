import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramNotifierService {
  getHello(): string {
    return 'Hello World!';
  }
}
