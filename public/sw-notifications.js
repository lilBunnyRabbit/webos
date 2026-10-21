// Imported into the generated service worker (vite.config.ts, workbox.importScripts; ADR-062). A worker is stopped
// after 30 s idle, so it keeps no time: it only routes notification clicks to a WebOS tab. Message shapes match
// src/lib/core/api/services/notifications/system.ts.

const CLICK_MESSAGE = "webos:notification-click";
const READY_MESSAGE = "webos:ready";
const CLAIM_TIMEOUT = 1000;
const READY_TIMEOUT = 20000;

const ready = new Set();
const waiting = new Map();

self.addEventListener("message", (event) => {
  if (event.data?.type !== READY_MESSAGE || !event.source) return;
  ready.add(event.source.id);
  waiting.get(event.source.id)?.();
});

function ask(client, message) {
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

function until_ready(id) {
  if (ready.has(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, READY_TIMEOUT);
    waiting.set(id, () => {
      clearTimeout(timer);
      resolve();
    });
  }).finally(() => waiting.delete(id));
}

async function route_click(notification, action) {
  const data = notification.data ?? {};
  const index = action === "" ? null : Number(action);
  const command = index === null ? null : (data.commands?.[index] ?? null);
  const message = { type: CLICK_MESSAGE, source: data.source, id: data.id, action: index, command, route: data.route ?? null };
  const scope = self.registration.scope;

  // Most recently focused first, so the tab the user was just in takes it.
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const tab of tabs.filter((client) => client.url.startsWith(scope))) {
    if (await ask(tab, message)) {
      await tab.focus().catch(() => {});
      return;
    }
  }

  const opened = await self.clients.openWindow(scope + (message.route ?? ""));
  if (!opened || !command) return;
  await until_ready(opened.id);
  await ask(opened, message);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(route_click(event.notification, event.action));
});
