import { afterEach, describe, expect, it, vi } from "vitest";
import { detect_browser, Engine, type Browser } from "./browser";
import { check, DISMISSED_KEY, Status, type CompatResult } from "./check";
import { FEATURES, Level } from "./features";
import { SCREEN_ID, show_compat_screen } from "./screen";

const by_id = (id: string) => FEATURES.find((feature) => feature.id === id)!;
const SAFARI: Browser = { name: "Safari", version: "18.4", os: "iOS", engine: Engine.WEBKIT, engine_version: "18.4" };

describe("probes in Chromium", () => {
  it("run without throwing and answer a boolean", () => {
    for (const feature of FEATURES) expect(typeof feature.probe(), feature.id).toBe("boolean");
  });

  it("find everything WebOS needs to start and every shell feature the owner's Chrome has", () => {
    const flagged = ["ai-writing", "pop-out", "notification-actions"];
    const failing = FEATURES.filter((feature) => (feature.level === Level.START || feature.level === Level.SHELL) && !flagged.includes(feature.id))
      .filter((feature) => !feature.probe())
      .map((feature) => feature.id);
    expect(failing).toEqual([]);
  });

  it("reads this browser as Chromium", () => {
    expect(detect_browser().engine).toBe(Engine.CHROMIUM);
  });

  it("catch a canvas that ignores its filter", () => {
    expect(by_id("canvas-filter").probe()).toBe(true);
  });
});

describe("the warning screen", () => {
  afterEach(() => {
    document.getElementById(SCREEN_ID)?.remove();
    localStorage.removeItem(DISMISSED_KEY);
  });

  const results: CompatResult[] = [
    { feature: by_id("backdrop-filter"), status: Status.OUTDATED },
    { feature: by_id("anchor-positioning"), status: Status.MISSING },
    { feature: by_id("opfs-write"), status: Status.MISSING },
    { feature: by_id("eyedropper"), status: Status.MISSING },
    { feature: by_id("popover"), status: Status.OK },
  ];

  it("groups problems by level in order, with the browser, apps and the update", () => {
    show_compat_screen({ results, browser: SAFARI, app: null, on_continue: () => {} });
    const root = document.getElementById(SCREEN_ID)!;
    expect([...root.querySelectorAll("h2")].map((heading) => heading.firstChild?.textContent)).toEqual(["Won't start", "Shell", "Apps", "Cosmetic"]);
    expect(root.querySelectorAll("li")).toHaveLength(4);
    expect(root.textContent).toContain("Safari 18.4 · iOS");
    expect(root.textContent).toContain("Update to iOS 26 or later");
    expect(root.textContent).toContain("Not available on iOS yet");
    expect(root.textContent).toContain("Apps: Paint");
    expect(root.textContent).toContain("May misbehave");
    expect(root.querySelector("button")!.textContent).toBe("Try anyway");
  });

  it("says Continue anyway when nothing needed to start is missing, and names a solo app", () => {
    show_compat_screen({ results: results.slice(3), browser: SAFARI, app: "paint", on_continue: () => {} });
    const root = document.getElementById(SCREEN_ID)!;
    expect(root.querySelector("button")!.textContent).toBe("Continue anyway");
    expect(root.querySelector(".c-browser")!.textContent).toBe("Paint · Safari 18.4 · iOS");
  });

  it("stores the problem ids when Don't show again is ticked, then continues", () => {
    const on_continue = vi.fn();
    show_compat_screen({ results, browser: SAFARI, app: null, on_continue });
    const root = document.getElementById(SCREEN_ID)!;
    root.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    root.querySelector("button")!.click();
    expect(on_continue).toHaveBeenCalledOnce();
    expect(document.getElementById(SCREEN_ID)).toBeNull();
    expect(JSON.parse(localStorage.getItem(DISMISSED_KEY)!)).toEqual(["anchor-positioning", "backdrop-filter", "eyedropper", "opfs-write"]);
  });

  it("stores nothing when continuing without ticking it", () => {
    show_compat_screen({ results, browser: SAFARI, app: null, on_continue: () => {} });
    document.getElementById(SCREEN_ID)!.querySelector("button")!.click();
    expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
  });

  it("checks this browser end to end", () => {
    const own = check(FEATURES, detect_browser());
    expect(own.find((result) => result.feature.id === "opfs")?.status).toBe(Status.OK);
  });
});
