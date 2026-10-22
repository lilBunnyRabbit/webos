import { describe, expect, it } from "vitest";
import { browser_label, compare_versions, Engine, parse_user_agent } from "./browser";

const UA = {
  chrome_mac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chrome_windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  chrome_android:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  opera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  firefox_mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
  firefox_android: "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
  safari_mac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  safari_ios:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  safari_ios_26:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  chrome_ios:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  chrome_ios_frozen:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  firefox_ios:
    "Mozilla/5.0 (iPad; CPU OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
};

describe("parse_user_agent", () => {
  it.each([
    ["chrome_mac", "Chrome", "141", "macOS", Engine.CHROMIUM, "141"],
    ["chrome_windows", "Chrome", "139", "Windows", Engine.CHROMIUM, "139"],
    ["chrome_android", "Chrome", "141", "Android", Engine.CHROMIUM, "141"],
    ["edge", "Edge", "141", "Windows", Engine.CHROMIUM, "141"],
    ["opera", "Opera", "124", "Windows", Engine.CHROMIUM, "140"],
    ["samsung", "Samsung Internet", "28.0", "Android", Engine.CHROMIUM, "130"],
    ["firefox_mac", "Firefox", "144", "macOS", Engine.GECKO, "144"],
    ["firefox_android", "Firefox", "144", "Android", Engine.GECKO, "144"],
    ["safari_mac", "Safari", "18.4", "macOS", Engine.WEBKIT, "18.4"],
    ["safari_ios", "Safari", "18.4", "iOS", Engine.WEBKIT, "18.4"],
    ["safari_ios_26", "Safari", "26.0", "iOS", Engine.WEBKIT, "26.0"],
    ["chrome_ios", "Chrome", "141", "iOS", Engine.WEBKIT, "17.5"],
    ["firefox_ios", "Firefox", "144", "iOS", Engine.WEBKIT, "17.4"],
  ] as const)("%s", (key, name, version, os, engine, engine_version) => {
    expect(parse_user_agent(UA[key])).toEqual({ name, version, os, engine, engine_version });
  });

  it("names Brave from its client hint brands", () => {
    expect(parse_user_agent(UA.chrome_mac, ["Brave", "Chromium", "Not=A?Brand"]).name).toBe("Brave");
  });

  it("reads headless Chrome as Chrome", () => {
    expect(parse_user_agent(UA.chrome_mac.replace("Chrome/", "HeadlessChrome/"))).toMatchObject({ name: "Chrome", engine: Engine.CHROMIUM });
  });

  it("leaves the engine version out when iOS's frozen 18.6 is all a non-Safari browser reports", () => {
    expect(parse_user_agent(UA.chrome_ios_frozen).engine_version).toBeNull();
  });

  it("recognises nothing in an unknown UA", () => {
    expect(parse_user_agent("curl/8.7.1")).toEqual({ name: null, version: null, os: null, engine: null, engine_version: null });
    expect(parse_user_agent("")).toMatchObject({ engine: null });
  });
});

describe("browser_label", () => {
  it("joins name, version and system", () => {
    expect(browser_label(parse_user_agent(UA.safari_ios))).toBe("Safari 18.4 · iOS");
    expect(browser_label(parse_user_agent(UA.edge))).toBe("Edge 141 · Windows");
    expect(browser_label(parse_user_agent("curl/8.7.1"))).toBe("Unknown browser");
  });
});

describe("compare_versions", () => {
  it("compares segment by segment", () => {
    expect(compare_versions("18.10", "18.4")).toBeGreaterThan(0);
    expect(compare_versions("18", "18.0")).toBe(0);
    expect(compare_versions("17.5", "18.3")).toBeLessThan(0);
    expect(compare_versions("141", "129")).toBeGreaterThan(0);
  });
});
