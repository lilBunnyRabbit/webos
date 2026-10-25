import html from "../../../../index.html?raw";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ANALYTICS_CONSENT_KEY, apply_consent, launch_event, set_consent, track_launch } from "./analytics";

const holder = globalThis as { gtag?: (...args: unknown[]) => void; webos_load_analytics?: () => void };

afterEach(() => {
  delete holder.gtag;
  delete holder.webos_load_analytics;
});

describe("without gtag", () => {
  test("tracking and consent do nothing", () => {
    expect(() => track_launch("notes", "full", "desktop")).not.toThrow();
    expect(() => set_consent("allowed")).not.toThrow();
  });
});

describe("with gtag", () => {
  test("a launch sends app_open with the app, mode and platform only", () => {
    const gtag = vi.fn();
    holder.gtag = gtag;
    track_launch("notes", "full", "mobile");
    expect(gtag).toHaveBeenCalledWith("event", "app_open", { app_id: "notes", mode: "desktop", platform: "mobile" });
  });

  test("a solo launch says solo", () => {
    expect(launch_event("paint", "solo", "desktop")).toEqual({ app_id: "paint", mode: "solo", platform: "desktop" });
  });

  test("only allowed grants analytics storage", () => {
    const gtag = vi.fn();
    holder.gtag = gtag;
    set_consent("allowed");
    set_consent("declined");
    set_consent("unasked");
    expect(gtag.mock.calls).toEqual([
      ["consent", "update", { analytics_storage: "granted" }],
      ["consent", "update", { analytics_storage: "denied" }],
      ["consent", "update", { analytics_storage: "denied" }],
    ]);
  });
});

describe("loading", () => {
  test("only allowed loads gtag", () => {
    const load = vi.fn();
    holder.webos_load_analytics = load;
    set_consent("declined");
    set_consent("unasked");
    expect(load).not.toHaveBeenCalled();
    set_consent("allowed");
    expect(load).toHaveBeenCalledOnce();
  });

  test("applying an answer mirrors it for index.html", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { setItem: (key: string, value: string) => store.set(key, value) });
    apply_consent("declined");
    expect(store.get(ANALYTICS_CONSENT_KEY)).toBe("declined");
    vi.unstubAllGlobals();
  });
});

test("index.html defines the loader set_consent calls", () => {
  expect(html).toContain("window.webos_load_analytics = ");
});

test("index.html reads the same mirror key", () => {
  expect(html).toContain(`"${ANALYTICS_CONSENT_KEY}"`);
});
