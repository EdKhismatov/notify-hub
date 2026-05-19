# Notify Hub 🚀

**Notify Hub** — масштабируемая микросервисная архитектура на **NestJS**, **RabbitMQ**, **PostgreSQL** и **Telegram Bot API**. Проект демонстрирует надёжную асинхронную обработку событий с гарантиями at-least-once доставки, идемпотентностью и устойчивостью к сбоям.

## 🏗 Архитектура

NestJS-монорепозиторий, общая библиотека + три независимых микросервиса:

- 📦 **Shared Library (`@app/shared`)** — DTO, интерфейсы, константы топологии RabbitMQ, Sequelize-модели (`OutboxEvent`, `ProcessedEvent`) и `DatabaseModule`.
- 🌐 **Producer (`apps/producer`)** — HTTP-шлюз, `POST /events`. Реализует **Transactional Outbox**: событие сначала записывается в БД, затем публикуется в RabbitMQ. Фоновый `OutboxRelayService` (cron каждые 10 сек) переотправляет зависшие в `pending` записи — гарантия доставки, даже если брокер недоступен.
- ⚙️ **Consumer (`apps/consumer`)** — обработчик бизнес-логики из `events_queue`. Идемпотентность через `processed_events` (composite PK `(id, consumer)` + Sequelize `upsert`), персистентный счётчик попыток, exponential backoff через retry-очередь с TTL.
- 📱 **Telegram Notifier (`apps/telegram-notifier`)** — слушает `notifications_queue`, отправляет HTML-сообщения через `telegraf`. Различает 4xx (→ DLQ), 429 (использует `retry_after`), 5xx/network (exponential backoff).

### Технологический стек

* **Backend:** TypeScript, NestJS 11, class-validator, `@nestjs/schedule`
* **Broker:** RabbitMQ + `@golevelup/nestjs-rabbitmq`
* **DB:** PostgreSQL 16 + Sequelize (`sequelize-typescript`)
* **Telegram:** `telegraf`
* **Infrastructure:** Docker, Docker Compose
* **API Docs:** Swagger UI
* **Tests:** Jest (unit + e2e)

## ✨ Ключевые механизмы надёжности

### 1. Transactional Outbox (Producer)

```
POST /events ──► outbox_events (INSERT, status='pending')
                      │
                      ├─► amqpConnection.publish() ──► RabbitMQ
                      │      │
                      │      └─ ✅ status='published'
                      │
                      └─ ✗ если брокер упал → status остаётся 'pending'
                            ▲
                            │  каждые 10 сек
                  OutboxRelayService.relay()
```

Событие никогда не теряется: оно сначала фиксируется в БД, и фоновый relay переотправляет его до `MAX_ATTEMPTS = 10` раз.

### 2. Идемпотентность через БД (Consumer / Telegram-notifier)

Таблица `processed_events` с составным первичным ключом `(id, consumer)`:

| id (uuid) | consumer | type | status | attempts | last_error | processed_at |
|---|---|---|---|---|---|---|

Перед обработкой делается `findOne` — если уже `success`, событие подтверждается без повторного выполнения. После обработки — `upsert` со статусом `success` / `failed` / `dead_lettered`. **Состояние переживает рестарты сервисов**, в отличие от прежнего in-memory `Set`.

### 3. Exponential backoff через retry-exchange

```
events_queue (Nack) ──► retry_exchange ──► events_retry_queue
                                                │
                                          (x-message-ttl = computeBackoffMs(attempts))
                                                │   1s, 2s, 4s, 8s, 16s, … cap 30s
                                                ▼  по истечении TTL
                                          x-dead-letter-exchange = events_exchange
                                                ▼
                                          events_queue  (повторная доставка)
```

Стандартный приём без плагина `rabbitmq_delayed_message_exchange`. Счётчик попыток (`x-attempts`) пробрасывается через AMQP-headers и синхронизируется с БД.

### 4. Классификация ошибок Telegram API

| Код | Категория | Поведение |
|---|---|---|
| 400/401/403 (4xx) | `permanent` | Сразу в DLQ — повторять бессмысленно |
| 429 | `rate_limited` | Backoff = `retry_after * 1000` мс из ответа Telegram |
| 5xx, network, timeout | `transient` | Exponential backoff |

### 5. `prefetchCount: 1`

У всех consumer'ов выставлен `prefetchCount: 1` — backoff не блокирует пачку префетченных сообщений, и нагрузка распределяется равномерно между репликами.

### 6. Publisher Confirms

Producer использует confirm-channel — `amqpConnection.publish()` резолвится только после `basic.ack` от брокера; сообщения с `persistent: true` записываются на диск.

### 7. Dead Letter Queue

После `MAX_RETRY_ATTEMPTS = 5` попыток сообщение уходит в `dead_letter_queue` для ручного разбора, и в `processed_events.status` записывается `dead_lettered`.

## 🚀 Как запустить

### 1. Переменные окружения
```bash
cp .env.example .env
```
Заполните `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`. Узнать chat_id — `@userinfobot`. **Перед использованием отправьте боту `/start`.**

### 2. Запуск через Docker (рекомендуется)
```bash
docker-compose up --build -d
```
Поднимет: PostgreSQL, RabbitMQ + management UI, producer, consumer, telegram-notifier. Все БД-схемы создаются автоматически (`synchronize: true` в Sequelize).

### 3. Локальная разработка
```bash
docker-compose up postgres rabbitmq -d   # инфраструктура
npm install
# в трёх отдельных терминалах:
npm run start:dev producer
npm run start:dev consumer
npm run start:dev telegram-notifier
```

## 📖 API

Swagger — **http://localhost:3001/api**

Пример запроса:
```bash
curl -X POST http://localhost:3001/events \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "payment.created",
    "payload": { "amount": 100, "currency": "USD" }
  }'
```

После отправки:
1. `201 Created` от Producer.
2. Строка в `outbox_events` со `status='published'`.
3. Лог обработки в Consumer + строка в `processed_events`.
4. Уведомление в Telegram + соответствующая строка `processed_events` для `telegram-notifier`.

## 🧪 Тесты

```bash
# Unit (быстрые, без инфраструктуры — мокаются БД и AMQP) — 18 тестов
npm test

# E2E (требуют поднятых RabbitMQ + Postgres) — 9 тестов
RUN_E2E=true npm run test:e2e
```

**Unit-тесты:**
* `EventsService` (producer): запись в outbox перед публикацией, обработка падения брокера, ID/timestamp/messageId.
* `EventsService` (consumer): идемпотентность, retry с exponential backoff, переход в DLQ.
* `TelegramService`: классификация 4xx/429/5xx/network, использование `retry_after`, идемпотентность.

**E2E-тесты** (поднимают реальные `INestApplication` против живых Postgres + RabbitMQ):
* Producer: 400 на невалидный payload, запись в outbox со статусом `published`, `/health` и `/health/live`.
* Consumer: подписка на `events_exchange`, появление строки в `processed_events`, health.
* Telegram-notifier: boot против реальной инфраструктуры, health.

CI (`.github/workflows/check.yml`) запускает lint, build, unit и e2e (с service-контейнерами Postgres + RabbitMQ) автоматически.

## ❤️ Health-check эндпоинты

Каждый сервис экспонирует:

* `GET /health/live` — liveness probe, всегда `200 OK` пока процесс жив.
* `GET /health` — readiness probe (Terminus): проверяет соединение с RabbitMQ и Postgres, `503` если одна из зависимостей недоступна.

Docker-compose использует `/health/live` как healthcheck для контейнеров.

## 🛠 Сборка / линт

```bash
npm run lint
npm run build producer
npm run build consumer
npm run build telegram-notifier
```

## 🔍 Полезные UI

- **RabbitMQ Management**: http://localhost:15672 (guest/guest) — очереди, exchange, DLQ.
- **Postgres**: `psql -h localhost -U notify -d notify_hub` — таблицы `outbox_events`, `processed_events`.
- **Swagger**: http://localhost:3001/api.
