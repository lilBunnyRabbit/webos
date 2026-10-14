import { describe, expect, test } from "vitest";
import { detect_platform, InstallPlatform } from "./install";

const UA = {
  chrome_mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edge_windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  safari_mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  safari_iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chrome_iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  firefox_mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
};

describe("detect_platform", () => {
  test("Chromium with the prompt API", () => {
    expect(detect_platform({ user_agent: UA.chrome_mac, max_touch_points: 0, has_prompt_api: true })).toBe(InstallPlatform.PROMPT);
    expect(detect_platform({ user_agent: UA.edge_windows, max_touch_points: 0, has_prompt_api: true })).toBe(InstallPlatform.PROMPT);
  });

  test("every iOS browser is WebKit, so it gets the Share sheet path", () => {
    expect(detect_platform({ user_agent: UA.safari_iphone, max_touch_points: 5, has_prompt_api: false })).toBe(InstallPlatform.IOS);
    expect(detect_platform({ user_agent: UA.chrome_iphone, max_touch_points: 5, has_prompt_api: false })).toBe(InstallPlatform.IOS);
  });

  test("iPadOS posing as a Mac", () => {
    expect(detect_platform({ user_agent: UA.safari_mac, max_touch_points: 5, has_prompt_api: false })).toBe(InstallPlatform.IOS);
  });

  test("Safari on a Mac", () => {
    expect(detect_platform({ user_agent: UA.safari_mac, max_touch_points: 0, has_prompt_api: false })).toBe(InstallPlatform.SAFARI_MAC);
  });

  test("Chrome on a Mac without the API is not Safari", () => {
    expect(detect_platform({ user_agent: UA.chrome_mac, max_touch_points: 0, has_prompt_api: false })).toBe(InstallPlatform.OTHER);
  });

  test("Firefox", () => {
    expect(detect_platform({ user_agent: UA.firefox_mac, max_touch_points: 0, has_prompt_api: false })).toBe(InstallPlatform.OTHER);
  });
});
