import { describe, expect, test } from "vitest";
import { Platform, detect_platform } from "./platform";

describe("detect_platform", () => {
  test("touch-first devices are mobile, the rest desktop", () => {
    expect(detect_platform("", true)).toBe(Platform.MOBILE);
    expect(detect_platform("", false)).toBe(Platform.DESKTOP);
  });

  test("?platform= overrides detection", () => {
    expect(detect_platform("?platform=mobile", false)).toBe(Platform.MOBILE);
    expect(detect_platform("?x=1&platform=desktop", true)).toBe(Platform.DESKTOP);
  });

  test("an unknown override is ignored", () => {
    expect(detect_platform("?platform=tablet", false)).toBe(Platform.DESKTOP);
  });
});
