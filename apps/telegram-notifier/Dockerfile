FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm ci

COPY apps/telegram-notifier ./apps/telegram-notifier
COPY libs ./libs

RUN npm run build telegram-notifier

# ---

FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3003

CMD ["node", "dist/apps/telegram-notifier/main"]
