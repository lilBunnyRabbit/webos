/// <reference lib="webworker" />
import {
  CLICK_MESSAGE,
  READY_MESSAGE,
  type NotificationClick,
  type SystemNotificationData,
} from "$lib/core/api/services/notifications/system";

const CLAIM_TIMEOUT = 1000;
const READY_TIMEOUT = 20000;

/**
 * Routes OS notification clicks to a WebOS tab, or opens one (ADR-062). A worker is stopped after 30 s idle, so it
 * keeps no time of its own.
 */
export function route_notification_clicks(scope: ServiceWorkerGlobalScope): void {
  const ready = new Set<string>();
  const waiting = new Map<string, () => void>();

  scope.addEventListener("message", (event) => {
    if (event.data?.type !== READY_MESSAGE || !(event.source instanceof Client)) return;
    ready.add(event.source.id);
    waiting.get(event.source.id)?.();
  });

  function ask(client: Client, message: NotificationClick): Promise<boolean> {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), CLAIM_TIMEOUT);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data?.claimed === true);
      };
      client.postMessage(message, [channel.port2]);
    });
  }

  function until_ready(id: string): Promise<void> {
    if (ready.has(id)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, READY_TIMEOUT);
      waiting.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
    }).finally(() => waiting.delete(id));
  }

  async function route_click(notification: Notification, action: string): Promise<void> {
    const data: Partial<SystemNotificationData> = notification.data ?? {};
    const index = action === "" ? null : Number(action);
    const command = index === null ? null : (data.commands?.[index] ?? null);
    const message = {
      type: CLICK_MESSAGE,
      source: data.source,
      id: data.id,
      action: index,
      command,
      route: data.route ?? null,
    } as NotificationClick;
    const base = scope.registration.scope;

    // Most recently focused first, so the tab the user was just in takes it.
    const tabs = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs.filter((client) => client.url.startsWith(base))) {
      if (await ask(tab, message)) {
        await tab.focus().catch(() => {});
        return;
      }
    }

    const opened = await scope.clients.openWindow(base + (message.route ?? ""));
    if (!opened || !command) return;
    await until_ready(opened.id);
    await ask(opened, message);
  }

  scope.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(route_click(event.notification, event.action));
  });
}
