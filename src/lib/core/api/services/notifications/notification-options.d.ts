// Persistent notification options Chrome supports that TypeScript's DOM lib leaves out, and Notification Triggers
// (behind Experimental Web Platform features).

interface NotificationOptions {
  actions?: { action: string; title: string; icon?: string }[];
  renotify?: boolean;
  timestamp?: number;
  showTrigger?: TimestampTrigger;
}

interface GetNotificationOptions {
  includeTriggered?: boolean;
}

interface Notification {
  readonly showTrigger?: TimestampTrigger;
  readonly timestamp?: number;
}

declare class TimestampTrigger {
  constructor(timestamp: number);
  readonly timestamp: number;
}
