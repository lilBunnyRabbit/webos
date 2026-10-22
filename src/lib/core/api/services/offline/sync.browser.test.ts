import { afterEach, describe, expect, test } from "vitest";
import icon from "$lib/apps/system/calculator/icon.svg?no-inline";
import { assets_cache } from "./lists";
import { save_icons } from "./sync";

const BUILD = 1;

afterEach(async () => {
  await caches.delete(assets_cache(BUILD));
});

describe("save_icons", () => {
  test("stores each icon in this build's cache and counts the ones that fail", async () => {
    const failed = await save_icons([icon, "http://127.0.0.1:1/unreachable.svg"], BUILD);
    expect(failed).toBe(1);
    const cache = await caches.open(assets_cache(BUILD));
    const stored = await cache.match(new URL(icon, location.href).href);
    expect(await stored?.text()).toContain('<view id="primary"/>');
  });
});
