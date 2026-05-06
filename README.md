# Notify Hub 🚀

**Notify Hub** — это масштабируемая микросервисная архитектура, построенная на базе **NestJS**, **RabbitMQ** и **Telegram Bot API**. Проект демонстрирует надежную асинхронную обработку событий, паттерны проектирования микросервисов и лучшие практики построения распределенных систем.

## 🏗 Архитектура

Проект реализован в виде **NestJS Монорепозитория** и состоит из одной общей библиотеки и трёх независимых микросервисов:

- 📦 **Shared Library (`@app/shared`)** — единый источник правды. Содержит DTO, интерфейсы и константы (названия очередей, обменников, ключи маршрутизации).
- 🌐 **Producer Service (`apps/producer`)** — HTTP REST API шлюз. Принимает входящие запросы (`POST /events`), валидирует их и публикует в RabbitMQ (Exchange: `events_exchange`).
- ⚙️ **Consumer Service (`apps/consumer`)** — обработчик бизнес-логики. Слушает очередь `events_queue`. Реализует паттерны идемпотентности, ручное подтверждение сообщений (ACK/NACK) и механизм `Dead Letter Queue` (DLQ) для обработки сбоев.
- 📱 **Telegram Notifier Service (`apps/telegram-notifier`)** — сервис уведомлений. Слушает очередь `notifications_queue` (через Fan-Out маршрутизацию) и отправляет отформатированные HTML-сообщения пользователю в Telegram.

### Технологический стек:
* **Backend:** TypeScript, NestJS, class-validator
* **Message Broker:** RabbitMQ (`@golevelup/nestjs-rabbitmq`, `amqplib`)
* **Telegram:** `telegraf`
* **Infrastructure:** Docker, Docker Compose
* **API Docs:** Swagger UI
* **CI/CD:** GitHub Actions (Lint, Build)

## ✨ Ключевые особенности (О чем стоит знать)

* **Fan-Out паттерн:** Событие из `Producer` отправляется в один `Exchange`, откуда копируется в две независимые очереди (`events_queue` и `notifications_queue`). Падение одного сервиса не аффектит другой.
* **Идемпотентность:** `Consumer` отслеживает UUID обработанных событий в памяти (Set) во избежание дублирования операций.
* **Dead Letter Queue (DLQ):** Если `Consumer` не может успешно обработать событие 3 раза (благодаря `x-retry-count`), сообщение не блокирует очередь, а отправляется в `dead_letter_queue` для последующего ручного разбора.
* **Graceful Degradation:** Telegram Notifier не падает, если токен не предоставлен, а лишь пишет предупреждение в лог.

## 🚀 Как запустить проект

### 1. Переменные окружения
Создайте файл `.env` в корне проекта (или скопируйте из `.env.example`) и заполните настройки Telegram:

```env
TELEGRAM_BOT_TOKEN=7123456789:AAH...твои-буквы-и-цифры
TELEGRAM_CHAT_ID=123456789
```
> **Внимание:** Перед началом использования обязательно отправьте своему боту команду `/start` в Telegram, иначе он не сможет вам написать. Узнать свой `TELEGRAM_CHAT_ID` можно через бота `@userinfobot`.

### 2. Запуск через Docker (Рекомендуется)
Убедитесь, что у вас установлен Docker и Docker Compose.

```bash
docker-compose up --build -d
```
Эта команда поднимет брокер RabbitMQ и все три микросервиса.

### 3. Запуск локально (для разработки)
```bash
# Поднять только RabbitMQ
docker-compose up rabbitmq -d

# Установить зависимости
npm install

# В разных окнах терминала запустить микросервисы:
npm run start:dev producer
npm run start:dev consumer
npm run start:dev telegram-notifier
```

## 📖 Использование API

Документация **Swagger** доступна по адресу:  
🔗 **http://localhost:3001/api**

Вы можете протестировать систему, отправив HTTP POST запрос через Swagger или cURL:

```bash
curl -X 'POST' \
  'http://localhost:3001/events' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "type": "payment.created",
  "payload": {
    "amount": 100,
    "currency": "USD"
  }
}'
```

После отправки вы должны увидеть:
1. Статус `201 Created` в ответе HTTP.
2. Логи успешной обработки в консоли `Consumer`.
3. Новое уведомление в вашем приложении Telegram от бота.

## 🛠 Запуск проверок (Линтер и сборка)

В проекте настроен строгий статический анализ:

```bash
# Запуск ESLint
npm run lint

# Сборка каждого микросервиса
npm run build producer
npm run build consumer
npm run build telegram-notifier
```
