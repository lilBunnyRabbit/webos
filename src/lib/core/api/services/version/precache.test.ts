import { describe, expect, test } from "vitest";
import {
  count_cached,
  keys_to_download,
  parse_precache_manifest,
  precache_cache_name,
  precache_key,
  progress_line,
} from "./precache";

const SW = `define(["./workbox-2c58ddf2"],function(s){"use strict";self.skipWaiting(),s.clientsClaim(),s.precacheAndRoute([{url:"assets/index-Ab_c-1.js",revision:null},{url:"index.html",revision:"e9cd7f"},{url:"assets/x-Q.css",revision:null}],{}),s.cleanupOutdatedCaches()});`;
const SCRIPT = "https://x.github.io/webos/sw.js";

describe("parse_precache_manifest", () => {
  test("reads hashed and revisioned entries from a built sw.js", () => {
    expect(parse_precache_manifest(SW)).toEqual([
      { url: "assets/index-Ab_c-1.js", revision: null },
      { url: "index.html", revision: "e9cd7f" },
      { url: "assets/x-Q.css", revision: null },
    ]);
  });

  test("a source without a manifest gives nothing", () => {
    expect(parse_precache_manifest("self.addEventListener('fetch', () => {})")).toEqual([]);
  });
});

describe("precache keys", () => {
  test("resolve against the worker's URL, with Workbox's revision parameter when there is one", () => {
    expect(precache_key({ url: "assets/a-1.js", revision: null }, SCRIPT)).toBe("https://x.github.io/webos/assets/a-1.js");
    expect(precache_key({ url: "index.html", revision: "abc" }, SCRIPT)).toBe(
      "https://x.github.io/webos/index.html?__WB_REVISION__=abc"
    );
  });

  test("the cache is named after the scope", () => {
    expect(precache_cache_name("https://x.github.io/webos/")).toBe("workbox-precache-v2-https://x.github.io/webos/");
  });

  test("only entries missing before the install count", () => {
    const manifest = parse_precache_manifest(SW);
    const before = new Set(["https://x.github.io/webos/assets/x-Q.css"]);
    const needed = keys_to_download(manifest, SCRIPT, before);
    expect(needed).toEqual([
      "https://x.github.io/webos/assets/index-Ab_c-1.js",
      "https://x.github.io/webos/index.html?__WB_REVISION__=e9cd7f",
    ]);
    expect(count_cached(needed, new Set([...before, needed[1]]))).toBe(1);
  });
});

describe("progress_line", () => {
  test("files and seconds once the total is known", () => {
    expect(progress_line(212, 606, 14_900)).toBe("212 of 606 files · 14 s");
  });

  test("only the time while it isn't, or when nothing needs downloading", () => {
    expect(progress_line(0, null, 3_000)).toBe("3 s");
    expect(progress_line(0, 0, 1_000)).toBe("1 s");
  });

  test("never more done than the total", () => {
    expect(progress_line(9, 8, 0)).toBe("8 of 8 files · 0 s");
  });
});
