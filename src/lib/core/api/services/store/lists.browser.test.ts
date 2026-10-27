import { afterEach, describe, expect, test } from "vitest";
import { ASSETS_CACHE, missing_apps } from "./lists";

const BASE = "/store-test/";

afterEach(async () => {
  await caches.delete(ASSETS_CACHE);
});

describe("missing_apps", () => {
  test("names the apps whose first file isn't in the cache", async () => {
    const cache = await caches.open(ASSETS_CACHE);
    await cache.put(new URL(`${BASE}assets/paint.manifest-a.js`, location.origin).href, new Response("export default {}"));
    const missing = await missing_apps(
      [
        { id: "paint", file: "assets/paint.manifest-a.js" },
        { id: "cards", file: "assets/cards.manifest-b.js" },
      ],
      BASE
    );
    expect(missing).toEqual(["cards"]);
  });
});
