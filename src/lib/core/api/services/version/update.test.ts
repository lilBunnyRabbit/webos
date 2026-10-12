import { describe, expect, test } from "vitest";
import { scope_caches, strip_update_param, with_update_param } from "./update";

describe("update parameter", () => {
  test("round trip keeps the rest of the URL", () => {
    const href = with_update_param("https://x.github.io/webos/?platform=mobile#a", 42);
    expect(href).toBe("https://x.github.io/webos/?platform=mobile&__upd=42#a");
    expect(strip_update_param(href)).toBe("/webos/?platform=mobile#a");
  });

  test("a URL without it is left alone", () => {
    expect(strip_update_param("https://x.github.io/webos/")).toBeNull();
  });
});

describe("scope_caches", () => {
  test("only this app's Workbox caches, never a sibling app's on the same origin", () => {
    const keys = [
      "workbox-precache-v2-https://x.github.io/webos/",
      "workbox-precache-v2-https://x.github.io/series-tracker/",
      "workbox-runtime-https://x.github.io/webos/",
      "other-cache",
    ];
    expect(scope_caches(keys, "https://x.github.io/webos/")).toEqual([
      "workbox-precache-v2-https://x.github.io/webos/",
      "workbox-runtime-https://x.github.io/webos/",
    ]);
  });
});
