import { describe, expect, test } from "vitest";
import { ASSETS_CACHE, legacy_caches, pool, unshared, unused } from "./lists";
import { parse_picked, parse_state, serialize_picked, serialize_state } from "./persistence";

describe("caches", () => {
  test("one cache for every release; only the per-build caches from before are legacy", () => {
    expect(ASSETS_CACHE).toBe("webos-assets");
    const keys = ["webos-assets-41", "webos-assets", "webos-wasm", "workbox-precache-v2-https://x/webos/", "webos-assets-7", "other-site"];
    expect(legacy_caches(keys)).toEqual(["webos-assets-41", "webos-assets-7"]);
  });

  test("unused leaves what an app still lists", () => {
    expect(unused(["assets/a.js", "assets/b.js", "assets/page.js"], new Set(["assets/a.js", "assets/page.js"]))).toEqual(["assets/b.js"]);
  });
});

describe("pool", () => {
  test("runs every item with at most `size` at once", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      done.push(item);
      running--;
    });
    expect(most).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("the first failure rejects and stops starting new items", async () => {
    const started: number[] = [];
    const run = pool([1, 2, 3, 4, 5], 1, async (item) => {
      started.push(item);
      if (item === 2) throw new Error("nope");
    });
    await expect(run).rejects.toThrow("nope");
    expect(started).toEqual([1, 2]);
  });
});

describe("unshared", () => {
  test("keeps only the files no other list holds", () => {
    const own = ["assets/paint.js", "assets/canvas.js", "assets/paint.css"];
    expect(unshared(own, [["assets/canvas.js", "assets/cards.js"], ["assets/x.js"]])).toEqual(["assets/paint.js", "assets/paint.css"]);
    expect(unshared(own, [])).toEqual(own);
  });
});

describe("persistence", () => {
  test("picked apps round-trip, sorted and unique", () => {
    expect(serialize_picked(["paint", "cards"])).toBe(JSON.stringify({ version: 1, apps: ["cards", "paint"] }, null, 2));
    expect(parse_picked(JSON.stringify({ version: 1, apps: ["cards", "cards", "paint"] }))).toEqual(["cards", "paint"]);
  });

  test("a missing, broken or unknown picked file is null", () => {
    expect(parse_picked(null)).toBeNull();
    expect(parse_picked("{")).toBeNull();
    expect(parse_picked(JSON.stringify({ version: 2, apps: [] }))).toBeNull();
  });

  test("state keeps its build", () => {
    const text = serialize_state({ build: 9, apps: ["paint", "cards"] });
    expect(parse_state(text)).toEqual({ build: 9, apps: ["cards", "paint"] });
    expect(parse_state(JSON.stringify({ apps: [] }))).toBeNull();
  });
});
