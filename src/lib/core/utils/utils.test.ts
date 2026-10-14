import { describe, expect, test } from "vitest";
import { clamp, error_message, escape_html, pad2 } from "./utils";

describe("utils", () => {
  test("error_message reads an Error, stringifies anything else", () => {
    expect(error_message(new Error("boom"))).toBe("boom");
    expect(error_message("plain")).toBe("plain");
    expect(error_message(42)).toBe("42");
  });

  test("clamp keeps a value inside the range", () => {
    expect(clamp(7, 0.25, 5)).toBe(5);
    expect(clamp(0.1, 0.25, 5)).toBe(0.25);
    expect(clamp(2, 0.25, 5)).toBe(2);
  });

  test("pad2 pads to two digits", () => {
    expect(pad2(7)).toBe("07");
    expect(pad2(12)).toBe("12");
    expect(pad2(0)).toBe("00");
  });

  test("escape_html escapes the five special characters", () => {
    expect(escape_html(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  });
});
