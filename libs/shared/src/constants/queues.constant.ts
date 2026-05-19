export const QUEUES = {
  EVENTS: 'events_queue',
  EVENTS_RETRY: 'events_retry_queue',
  NOTIFICATIONS: 'notifications_queue',
  NOTIFICATIONS_RETRY: 'notifications_retry_queue',
  DEAD_LETTER: 'dead_letter_queue',
} as const;

export const EXCHANGES = {
  EVENTS: 'events_exchange',
  RETRY: 'retry_exchange',
  DEAD_LETTER: 'dead_letter_exchange',
} as const;

export const ROUTING_KEYS = {
  EVENT_CREATED: 'event.created',
  NOTIFICATION_SEND: 'notification.send',
  RETRY_EVENTS: 'retry.events',
  RETRY_NOTIFICATIONS: 'retry.notifications',
} as const;

/**
 * Maximum number of processing attempts before message is sent to DLQ.
 */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Compute exponential backoff delay (capped at 30s).
 * 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
 */
export function computeBackoffMs(attempts: number): number {
  return Math.min(1000 * Math.pow(2, Math.max(0, attempts - 1)), 30_000);
}
