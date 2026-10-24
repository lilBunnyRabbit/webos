import { describe, expect, it } from "vitest";
import { failed_module_url, failure_details, load_failure, LoadFailure, retry_url } from "./load-error";

describe("load_failure", () => {
  it.each([
    "Failed to fetch dynamically imported module: http://localhost/webos/src/lib/apps/user/snake/snake.app.svelte",
    "error loading dynamically imported module: https://example.com/assets/snake-abc.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /webos/assets/snake-abc.css",
  ])("reads %s as a fetch failure", (message) => {
    expect(load_failure(new TypeError(message))).toBe(LoadFailure.FETCH);
  });

  it("reads anything else as a code failure", () => {
    expect(load_failure(new SyntaxError("Unexpected token '<'"))).toBe(LoadFailure.CODE);
    expect(load_failure(new ReferenceError("window is not defined"))).toBe(LoadFailure.CODE);
    expect(load_failure("boom")).toBe(LoadFailure.CODE);
  });
});

describe("failure_details", () => {
  it("keeps a Chrome stack that already starts with the error line", () => {
    const error = new TypeError("bad");
    error.stack = "TypeError: bad\n    at load (app.js:1:1)";
    expect(failure_details(error)).toBe("TypeError: bad\n    at load (app.js:1:1)");
  });

  it("puts the error line above a Firefox-style stack", () => {
    const error = new TypeError("bad");
    error.stack = "load@app.js:1:1";
    expect(failure_details(error)).toBe("TypeError: bad\nload@app.js:1:1");
  });

  it("falls back to the error line or the value", () => {
    const error = new Error("plain");
    error.stack = undefined;
    expect(failure_details(error)).toBe("Error: plain");
    expect(failure_details(42)).toBe("42");
  });
});

describe("failed_module_url", () => {
  const origin = "http://localhost:5187";

  it("reads the chunk Chrome and Firefox name", () => {
    const chrome = new TypeError(`Failed to fetch dynamically imported module: ${origin}/webos/src/lib/apps/user/snake/snake.app.svelte?t=17`);
    expect(failed_module_url(chrome, origin)).toBe(`${origin}/webos/src/lib/apps/user/snake/snake.app.svelte?t=17`);
    const firefox = new TypeError(`error loading dynamically imported module: ${origin}/webos/assets/snake-abc.js`);
    expect(failed_module_url(firefox, origin)).toBe(`${origin}/webos/assets/snake-abc.js`);
  });

  it("gives nothing for Safari, other origins and other errors", () => {
    expect(failed_module_url(new TypeError("Importing a module script failed."), origin)).toBeNull();
    expect(failed_module_url(new TypeError("Failed to fetch dynamically imported module: https://evil.example/x.js"), origin)).toBeNull();
    expect(failed_module_url(new SyntaxError("Unexpected token"), origin)).toBeNull();
  });
});

describe("retry_url", () => {
  it("adds or replaces the retry query, keeping the rest", () => {
    expect(retry_url("http://localhost/a.svelte?t=17", 1)).toBe("http://localhost/a.svelte?t=17&retry=1");
    expect(retry_url("http://localhost/a.js?retry=1", 2)).toBe("http://localhost/a.js?retry=2");
  });
});
