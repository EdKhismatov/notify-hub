import { Test, TestingModule } from '@nestjs/testing';
import { TelegramNotifierController } from './telegram-notifier.controller';
import { TelegramNotifierService } from './telegram-notifier.service';

describe('TelegramNotifierController', () => {
  let telegramNotifierController: TelegramNotifierController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [TelegramNotifierController],
      providers: [TelegramNotifierService],
    }).compile();

    telegramNotifierController = app.get<TelegramNotifierController>(TelegramNotifierController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(telegramNotifierController.getHello()).toBe('Hello World!');
    });
  });
});
