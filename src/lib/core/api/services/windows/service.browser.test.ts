import { describe, expect, test } from "vitest";
import type { AppInstance } from "../apps/type";
import { WindowsService } from "./service.svelte";
import { WindowFlag, type WindowId } from "./type";
import { snapshot_window } from "../session/snapshot.svelte";

function app(id: string): AppInstance {
  return {
    id,
    manifest: { id, name: id },
    component: new Promise(() => {}),
    props: {},
    state: {},
  } as unknown as AppInstance;
}

const minimized = (windows: WindowsService, id: WindowId) => windows.get(id)?.flags.has(WindowFlag.MINIMIZED);

describe("WindowsService.toggle_desktop", () => {
  test("hides the visible windows, then brings back only those with focus where it was", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));
    const c = windows.open(app("c"));
    windows.toggle_minimize(a);
    windows.focus(b);

    expect(windows.toggle_desktop()).toBe(true);
    expect(windows.showing_desktop).toBe(true);
    expect([a, b, c].map((id) => minimized(windows, id))).toEqual([true, true, true]);
    expect(windows.get_focused()).toBeNull();

    expect(windows.toggle_desktop()).toBe(false);
    expect(windows.showing_desktop).toBe(false);
    expect([a, b, c].map((id) => minimized(windows, id))).toEqual([true, false, false]);
    expect(windows.get_focused()).toBe(b);
  });

  test("restoring or opening a window forgets the hidden set", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));

    windows.toggle_desktop();
    windows.toggle_minimize(a);
    expect(windows.showing_desktop).toBe(false);

    expect(windows.toggle_desktop()).toBe(true);
    expect(minimized(windows, a)).toBe(true);
    expect(minimized(windows, b)).toBe(true);

    windows.open(app("c"));
    expect(windows.showing_desktop).toBe(false);
  });

  test("a closed window is skipped on the way back, and nothing visible means nothing to hide", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));

    windows.toggle_desktop();
    windows.force_close(a);
    windows.toggle_desktop();
    expect(windows.list()).toEqual([b]);
    expect(minimized(windows, b)).toBe(false);

    windows.toggle_minimize(b);
    expect(windows.toggle_desktop()).toBe(false);
    expect(windows.showing_desktop).toBe(false);
  });
});

describe("WindowsService.toggle_guide (ADR-085)", () => {
  test("shows the guide and brings the window forward, then hides it; the session never keeps it", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    windows.open(app("b"));

    expect(windows.toggle_guide(a)).toBe(true);
    expect(windows.get(a)?.flags.has(WindowFlag.GUIDE)).toBe(true);
    expect(windows.get_focused()).toBe(a);
    expect(snapshot_window(windows.get(a)!).flags).toEqual([]);

    expect(windows.toggle_guide(a)).toBe(false);
    expect(windows.get(a)?.flags.has(WindowFlag.GUIDE)).toBe(false);
    expect(windows.toggle_guide("missing")).toBe(false);
  });
});
