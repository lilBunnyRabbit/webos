// OS notifications through the service worker, and the clicks `public/sw-notifications.js` hands back to a tab. Keep
// the message shapes in step with that file.

export const CLICK_MESSAGE = "webos:notification-click";
export const READY_MESSAGE = "webos:ready";

export const ClickSource = {
  NOTIFICATIONS: "notifications",
  SCHEDULER: "scheduler",
} as const;
export type ClickSource = (typeof ClickSource)[keyof typeof ClickSource];

export interface SystemNotificationData {
  source: ClickSource;
  id: string;
  /** `#/app/{id}?{props}` a body click opens when no tab takes it; `null` opens WebOS. */
  route: string | null;
  /** Shell command per action button, by index. Empty for buttons only the sending tab can run. */
  commands: string[];
}

export interface NotificationClick {
  type: typeof CLICK_MESSAGE;
  source: ClickSource;
  id: string;
  action: number | null;
  command: string | null;
  route: string | null;
}

export interface SystemNotificationOptions {
  body?: string;
  tag: string;
  data: SystemNotificationData;
  actions?: string[];
  require_interaction?: boolean;
  /** Alerts again when it replaces one with the same tag. */
  renotify?: boolean;
  timestamp?: number;
}

const local_clicks = new EventTarget();

function notification_options(options: SystemNotificationOptions): NotificationOptions {
  return {
    body: options.body,
    tag: options.tag,
    data: options.data,
    actions: options.actions?.map((title, index) => ({ action: String(index), title })),
    requireInteraction: options.require_interaction,
    renotify: options.renotify,
    timestamp: options.timestamp,
  };
}

export async function active_registration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  return registration?.active ? registration : null;
}

export function permission(): NotificationPermission | "unsupported" {
  return "Notification" in globalThis ? Notification.permission : "unsupported";
}

/**
 * Shows an OS notification when permission is granted; resolves whether it did. Through the service worker, which
 * Android requires and which gives buttons and clicks that outlive the tab. Without one (the dev server) a page
 * `Notification`, without buttons, whose click goes to this tab's listeners.
 */
export async function show_system_notification(title: string, options: SystemNotificationOptions): Promise<boolean> {
  if (permission() !== "granted") return false;
  const registration = await active_registration();
  if (registration) {
    await registration.showNotification(title, notification_options(options));
    return true;
  }
  const notification = new Notification(title, { body: options.body, tag: options.tag, data: options.data });
  notification.onclick = () => {
    window.focus();
    notification.close();
    const click: NotificationClick = { type: CLICK_MESSAGE, source: options.data.source, id: options.data.id, action: null, command: null, route: options.data.route };
    local_clicks.dispatchEvent(new CustomEvent(CLICK_MESSAGE, { detail: click }));
  };
  return true;
}

/** A notification that shows at `at` even with every WebOS tab closed. Only where `showTrigger` exists. */
export async function show_triggered_notification(title: string, at: number, options: SystemNotificationOptions): Promise<void> {
  const registration = await active_registration();
  if (!registration || permission() !== "granted") return;
  await registration.showNotification(title, { ...notification_options(options), timestamp: at, showTrigger: new TimestampTrigger(at) });
}

export function supports_triggers(): boolean {
  return "Notification" in globalThis && "showTrigger" in Notification.prototype;
}

export function is_click(data: unknown): data is NotificationClick {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === CLICK_MESSAGE;
}

/**
 * Hands `source`'s clicks to `handle`, which answers whether this tab takes it. The worker asks tabs one at a time,
 * most recently focused first, and focuses the first that takes it; a tab that answers no lets the next one try.
 */
export function listen_clicks(source: ClickSource, handle: (click: NotificationClick) => boolean): () => void {
  const on_message = (event: MessageEvent) => {
    if (!is_click(event.data) || event.data.source !== source) return;
    let claimed = false;
    try {
      claimed = handle(event.data);
    } finally {
      event.ports[0]?.postMessage({ claimed });
    }
  };
  const on_local = (event: Event) => {
    const click = (event as CustomEvent<NotificationClick>).detail;
    if (click.source === source) handle(click);
  };
  navigator.serviceWorker?.addEventListener("message", on_message);
  local_clicks.addEventListener(CLICK_MESSAGE, on_local);
  return () => {
    navigator.serviceWorker?.removeEventListener("message", on_message);
    local_clicks.removeEventListener(CLICK_MESSAGE, on_local);
  };
}

/** Tells the worker this tab can take clicks: a window it opened for a button waits for this before handing it over. */
export function announce_ready(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: READY_MESSAGE });
}
