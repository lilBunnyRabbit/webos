import { afterEach, expect, test } from "vitest";
import { install_precache, type PrecacheTarget } from "./install";

const CACHE = "install-test";
const QUICK = { concurrency: 3, attempts: 2, backoff_ms: 1 };

const file = (name: string) => new URL(name, import.meta.url).href;

afterEach(() => caches.delete(CACHE));

test("downloads only what the cache lacks, under Workbox's keys, and keeps the rest", async () => {
  const cache = await caches.open(CACHE);
  const kept: PrecacheTarget = { url: file("./install.ts"), key: file("./install.ts") };
  const fresh: PrecacheTarget = { url: file("./install.test.ts"), key: file("./install.test.ts") };
  const revisioned: PrecacheTarget = {
    url: file("./notification-clicks.ts"),
    key: `${file("./notification-clicks.ts")}?__WB_REVISION__=abc`,
  };
  await cache.put(kept.key, new Response("from the last build"));
  const requested: string[] = [];

  const downloaded = await install_precache([kept, fresh, revisioned], cache, (request) => {
    requested.push(request.url);
    return fetch(request);
  }, QUICK);

  expect(downloaded).toBe(2);
  expect(requested.sort()).toEqual([fresh.url, revisioned.url].sort());
  expect(await (await cache.match(kept.key))!.text()).toBe("from the last build");
  expect(await (await cache.match(fresh.key))!.text()).toContain("run_limited");
  expect(await (await cache.match(revisioned.key))!.text()).toContain("notificationclick");
});

test("a file that never arrives fails the install", async () => {
  const cache = await caches.open(CACHE);
  const missing = { url: "http://127.0.0.1:1/gone.js", key: "http://127.0.0.1:1/gone.js" };
  await expect(install_precache([missing], cache, fetch, QUICK)).rejects.toThrow();
  expect(await cache.keys()).toHaveLength(0);
});
