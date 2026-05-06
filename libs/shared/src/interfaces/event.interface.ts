export interface IEvent {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface IEventHandler {
  handle(event: IEvent): Promise<void>;
}
