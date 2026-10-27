import { describe, expect, test } from "vitest";
import { retry_page_url } from "./pages";

describe("retry_page_url", () => {
  test("a failed page chunk loads next from its URL with a fresh query", () => {
    const failed = new TypeError("Failed to fetch dynamically imported module: http://localhost/webos/assets/clipboard-BIh0.js");
    expect(retry_page_url(failed, 1)).toBe("http://localhost/webos/assets/clipboard-BIh0.js?retry=1");
    const again = new TypeError("Failed to fetch dynamically imported module: http://localhost/webos/assets/clipboard-BIh0.js?retry=1");
    expect(retry_page_url(again, 2)).toBe("http://localhost/webos/assets/clipboard-BIh0.js?retry=2");
  });

  test("an error without a URL (Safari, a missing page) has none", () => {
    expect(retry_page_url(new Error('No page called "x"'), 1)).toBeNull();
    expect(retry_page_url("offline", 1)).toBeNull();
  });
});
