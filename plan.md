# 🚀 План разработки: NestJS Microservices + RabbitMQ + Telegram Bot

## 📌 Название проекта

**`notify-hub`** — лаконично, профессионально, отражает суть (хаб уведомлений).

Альтернативы:
- `nest-notify-gateway`
- `rabbit-notify`
- `event-notifier`

---

## 🗂️ Структура монорепозитория

```
notify-hub/
├── apps/
│   ├── producer/          # Сервис-отправитель сообщений
│   ├── consumer/          # Сервис-получатель и обработчик
│   └── telegram-notifier/ # Сервис Telegram-уведомлений
├── libs/
│   └── shared/            # Общие DTO, интерфейсы, константы
├── docker/
│   └── rabbitmq/          # Конфигурация RabbitMQ (если нужна кастомная)
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── nest-cli.json          # Monorepo config
├── tsconfig.json
├── package.json
└── README.md
```

> Используем **NestJS Monorepo** — единый репозиторий, несколько приложений.

---

## 🛠️ Технологический стек

| Технология | Назначение |
|---|---|
| **NestJS** | Фреймворк для микросервисов |
| **RabbitMQ** | Брокер сообщений |
| **amqplib / @golevelup/nestjs-rabbitmq** | Клиент RabbitMQ |
| **Telegraf или node-telegram-bot-api** | Telegram Bot API |
| **Docker + Docker Compose** | Оркестрация сервисов |
| **Swagger (@nestjs/swagger)** | Документация API |
| **Jest + Supertest** | Unit и e2e тесты |
| **Winston или Pino** | Логирование |
| **uuid** | Генерация уникальных ID |
| **class-validator / class-transformer** | Валидация DTO |

---

## 📋 Этапы разработки

---

### 🔷 Этап 1 — Инициализация проекта и среды (1-2 часа)

**Цель:** подготовить скелет монорепозитория и Docker-окружение.

#### Задачи:
1. **Создать NestJS монорепозиторий:**
   ```bash
   npm i -g @nestjs/cli
   nest new notify-hub
   cd notify-hub
   nest generate app producer
   nest generate app consumer
   nest generate app telegram-notifier
   nest generate library shared
   ```

2. **Настроить `nest-cli.json`** для монорепо-конфигурации.

3. **Создать `docker-compose.yml`** с сервисами:
   - `rabbitmq` (образ: `rabbitmq:3-management`)
   - `producer`
   - `consumer`
   - `telegram-notifier`

4. **Создать `.env.example`** с переменными:
   ```env
   RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id
   QUEUE_NAME=events_queue
   ```

5. Добавить `README.md` с секцией "Getting Started".

**✅ Результат:** проект запускается командой `docker-compose up`, RabbitMQ Management UI доступен на `localhost:15672`.

---

### 🔷 Этап 2 — Shared Library: DTO и интерфейсы (1 час)

**Цель:** определить контракты взаимодействия между сервисами.

#### Задачи:
1. В `libs/shared/src` создать:
   - `dto/event.dto.ts` — описание события:
     ```typescript
     export class EventDto {
       id: string;        // UUID для идемпотентности
       type: string;      // тип события
       payload: Record<string, any>;
       timestamp: string;
     }
     ```
   - `interfaces/event.interface.ts`
   - `constants/queues.constant.ts` — имена очередей, exchange

2. Экспортировать всё через `index.ts` библиотеки.

**✅ Результат:** единые типы для всех трёх сервисов.

---

### 🔷 Этап 3 — Producer Service (2-3 часа)

**Цель:** сервис, принимающий HTTP-запросы и публикующий события в RabbitMQ.

#### Задачи:
1. **Установить зависимости:**
   ```bash
   npm install @golevelup/nestjs-rabbitmq uuid class-validator class-transformer @nestjs/swagger
   ```

2. **Реализовать модули:**
   - `RabbitmqModule` — подключение к брокеру с retry-логикой
   - `EventsModule` — бизнес-логика отправки событий
   - `EventsController` — REST endpoint `POST /events`
   - `EventsService`:
     - генерация UUID (`crypto.randomUUID()`)
     - сериализация в JSON
     - публикация в RabbitMQ с `{ persistent: true }`
     - логирование успеха/ошибки

3. **Настроить Swagger:**
   ```typescript
   // main.ts
   const config = new DocumentBuilder()
     .setTitle('Producer API')
     .setDescription('Event publishing service')
     .setVersion('1.0')
     .build();
   ```

4. **Добавить retry при старте** (ждать RabbitMQ):
   ```typescript
   // heartbeat, reconnect options в конфиге подключения
   ```

**✅ Результат:** `POST /events` → сообщение появляется в очереди RabbitMQ.

---

### 🔷 Этап 4 — Consumer Service (2-3 часа)

**Цель:** сервис, читающий события из очереди и обрабатывающий их.

#### Задачи:
1. **Реализовать модули:**
   - `RabbitmqModule` — подписка на очередь
   - `EventsModule` — обработка событий
   - `EventsHandler`:
     - `@RabbitSubscribe` / `@MessagePattern` декоратор
     - **Ручное подтверждение (manual ack):**
       ```typescript
       channel.ack(originalMsg); // при успехе
       channel.nack(originalMsg, false, true); // при ошибке → retry
       ```
     - Логирование `[SUCCESS]` / `[FAILED]`
     - DLQ (Dead Letter Queue) для необработанных сообщений

2. **Реализовать идемпотентность:**
   - хранить обработанные `id` событий (Map / Redis опционально)
   - пропускать дубликаты

3. **Механизм повтора:**
   - при ошибке: `nack` с `requeue: true` + счётчик попыток
   - после N попыток → отправить в DLQ

**✅ Результат:** Consumer принимает, обрабатывает сообщения, логирует результат, корректно обрабатывает ошибки.

---

### 🔷 Этап 5 — Telegram Notifier Service (1-2 часа)

**Цель:** сервис, который слушает очередь и отправляет уведомления в Telegram.

#### Задачи:
1. **Установить зависимости:**
   ```bash
   npm install telegraf node-telegram-bot-api
   ```

2. **Создать Telegram Bot:**
   - зарегистрировать бота через `@BotFather`
   - получить `BOT_TOKEN` и `CHAT_ID`

3. **Реализовать:**
   - `TelegramModule` — инициализация клиента
   - `TelegramService`:
     ```typescript
     async sendNotification(event: EventDto): Promise<void> {
       const message = this.formatMessage(event);
       await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
     }
     ```
   - `NotificationHandler` — подписка на отдельную очередь (`notifications_queue`)
   - Форматирование сообщений (HTML/Markdown):
     ```
     🔔 <b>Новое событие</b>
     Тип: payment.created
     ID: abc-123
     Время: 2025-01-01 12:00
     ```

4. **Опционально:** отдельная очередь для уведомлений или тот же топик.

**✅ Результат:** событие из RabbitMQ → уведомление в Telegram-чат.

---

### 🔷 Этап 6 — Тесты, Документация, Финализация (2-3 часа)

**Цель:** покрыть код тестами, написать README, подготовить к сдаче.

#### Задачи:
1. **Unit тесты (Jest):**
   - `EventsService` — проверить генерацию UUID, сериализацию
   - `EventsHandler` — мокировать канал, проверить ack/nack
   - `TelegramService` — мокировать Telegram-клиент

2. **e2e тесты (Supertest):**
   - `POST /events` → 201 Created
   - `POST /events` с невалидным телом → 400 Bad Request

3. **Swagger:** убедиться, что все эндпоинты задокументированы с примерами.

4. **README.md** содержит:
   ```markdown
   ## Быстрый старт
   1. cp .env.example .env
   2. Заполни BOT_TOKEN и CHAT_ID
   3. docker-compose up --build
   
   ## Сервисы
   | Сервис | URL |
   |---|---|
   | Producer API | http://localhost:3001 |
   | Swagger UI | http://localhost:3001/api |
   | RabbitMQ UI | http://localhost:15672 |
   
   ## Тесты
   npm run test
   npm run test:e2e
   ```

5. **`.gitignore`, `.env.example`** — не коммитить `.env` с токенами!

**✅ Результат:** готовый репозиторий, тесты проходят, README позволяет запустить проект за 3 команды.

---

## ⏱️ Временная оценка

| Этап | Время |
|---|---|
| Этап 1: Инициализация | ~2 ч |
| Этап 2: Shared Library | ~1 ч |
| Этап 3: Producer | ~3 ч |
| Этап 4: Consumer | ~3 ч |
| Этап 5: Telegram Notifier | ~2 ч |
| Этап 6: Тесты + Документация | ~3 ч |
| **Итого** | **~14 часов** |

---

## 💡 Советы по оформлению репозитория

- **Коммиты по конвенции:** `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- **Ветки:** `main` (stable) → `develop` → `feature/producer`, `feature/consumer`, etc.
- **GitHub Actions** (бонус): CI pipeline с запуском тестов на каждый push

---

## 🎯 Порядок старта

```
Этап 1 → 2 → 3 → 4 → 5 → 6
```

Начни с **Этапа 1** — создай монорепозиторий и подними Docker. 
Это фундамент, без которого остальное не запустится.
