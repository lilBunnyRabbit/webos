import { afterEach, describe, expect, test } from "vitest";
import { cached_size } from "./app-size";

const CACHE = "app-size-test";

afterEach(async () => await caches.delete(CACHE));

describe("cached_size", () => {
  test("sums the cached files and skips the missing ones", async () => {
    const cache = await caches.open(CACHE);
    await cache.put(new URL("/size-test/assets/a.js", location.origin).href, new Response("abcd"));
    await cache.put(new URL("/size-test/assets/b.css", location.origin).href, new Response("123456"));
    expect(await cached_size("/size-test/", ["assets/a.js", "assets/b.css", "assets/gone.js"])).toBe(10);
  });

  test("nothing cached is unknown, not zero", async () => {
    expect(await cached_size("/size-test/", ["assets/gone.js"])).toBeNull();
    expect(await cached_size("/size-test/", [])).toBeNull();
  });
});
