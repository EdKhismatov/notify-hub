export const QUEUES = {
  EVENTS: 'events_queue',
  NOTIFICATIONS: 'notifications_queue',
  DEAD_LETTER: 'dead_letter_queue',
} as const;

export const EXCHANGES = {
  EVENTS: 'events_exchange',
  DEAD_LETTER: 'dead_letter_exchange',
} as const;

export const ROUTING_KEYS = {
  EVENT_CREATED: 'event.created',
  NOTIFICATION_SEND: 'notification.send',
} as const;
