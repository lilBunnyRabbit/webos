import { describe, expect, test } from "vitest";
import { cache_mode, download, missing_targets, precache_targets, run_limited, type Fetcher } from "./install";

const QUICK = { concurrency: 4, attempts: 3, backoff_ms: 1 };
const HASHED = { url: "https://x.io/webos/assets/a-1.js", key: "https://x.io/webos/assets/a-1.js" };
const REVISIONED = { url: "https://x.io/webos/index.html", key: "https://x.io/webos/index.html?__WB_REVISION__=abc" };

describe("targets", () => {
  test("come from Workbox's url to key map", () => {
    const map = new Map([[HASHED.url, HASHED.key], [REVISIONED.url, REVISIONED.key]]);
    expect(precache_targets(map)).toEqual([HASHED, REVISIONED]);
  });

  test("only keys the cache lacks are missing", () => {
    expect(missing_targets([HASHED, REVISIONED], new Set([HASHED.key]))).toEqual([REVISIONED]);
    expect(missing_targets([HASHED, REVISIONED], new Set([REVISIONED.url]))).toEqual([HASHED, REVISIONED]);
  });

  test("a hashed file may come from the HTTP cache, a revisioned one and every retry may not", () => {
    expect(cache_mode(HASHED, 0)).toBe("default");
    expect(cache_mode(REVISIONED, 0)).toBe("reload");
    expect(cache_mode(HASHED, 1)).toBe("reload");
  });
});

describe("run_limited", () => {
  test("never runs more than the limit at once, and runs everything", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await run_limited([...Array(30).keys()], 5, async (item) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, item % 3));
      done.push(item);
      running--;
    });
    expect(peak).toBe(5);
    expect(done.sort((a, b) => a - b)).toEqual([...Array(30).keys()]);
  });

  test("the first failure rejects and starts nothing new", async () => {
    const started: number[] = [];
    const run = run_limited([...Array(20).keys()], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (item === 3) throw new Error("boom");
    });
    await expect(run).rejects.toThrow("boom");
    expect(started.length).toBeLessThan(7);
  });

  test("nothing to do resolves", async () => {
    await expect(run_limited([], 8, async () => {})).resolves.toBeUndefined();
  });
});

describe("download", () => {
  function flaky(failures: number, fail: () => Response | never): { fetcher: Fetcher; calls: Request[] } {
    const calls: Request[] = [];
    return {
      calls,
      fetcher: async (request) => {
        calls.push(request);
        return calls.length <= failures ? fail() : new Response("ok");
      },
    };
  }

  test("retries a network error and a bad status, bypassing the HTTP cache", async () => {
    const offline = flaky(1, () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await (await download(HASHED, offline.fetcher, QUICK)).text()).toBe("ok");
    expect(offline.calls.map((request) => request.cache)).toEqual(["default", "reload"]);

    const busy = flaky(2, () => new Response("", { status: 503 }));
    expect((await download(HASHED, busy.fetcher, QUICK)).ok).toBe(true);
    expect(busy.calls).toHaveLength(3);
  });

  test("gives up after the last try with the last failure", async () => {
    const gone = flaky(9, () => new Response("", { status: 404 }));
    await expect(download(HASHED, gone.fetcher, QUICK)).rejects.toThrow("assets/a-1.js: 404");
    expect(gone.calls).toHaveLength(3);
  });
});
