import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { bind } from "../shell/parse";
import { tokenize } from "../shell/tokenize";
import { windows_shell } from "./shell";
import { immersive as immersive_command } from "./shell-run";
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

describe("WindowsService.set_immersive (ADR-101)", () => {
  const immersive = (windows: WindowsService, id: WindowId) => windows.get(id)?.flags.has(WindowFlag.IMMERSIVE);

  async function enter_by_click(windows: WindowsService, id: WindowId) {
    const button = document.createElement("button");
    button.textContent = "Full screen";
    button.onclick = () => windows.set_immersive(id, true);
    document.body.append(button);
    try {
      await userEvent.click(button);
      await vi.waitFor(() => expect(document.fullscreenElement).toBe(document.documentElement));
    } finally {
      button.remove();
    }
  }

  test("enters on a minimized window by bringing it back; back leaves it before the app's handlers; the session never keeps it", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    windows.open(app("b"));
    windows.toggle_minimize(a);
    const app_back = vi.fn(() => true);
    windows.add_back_handler(a, app_back);

    expect(windows.set_immersive(a, true)).toBe(true);
    expect(immersive(windows, a)).toBe(true);
    expect(minimized(windows, a)).toBe(false);
    expect(windows.get_focused()).toBe(a);
    expect(snapshot_window(windows.get(a)!).flags).toEqual([]);

    expect(windows.back(a)).toBe(true);
    expect(immersive(windows, a)).toBe(false);
    expect(app_back).not.toHaveBeenCalled();
    expect(windows.set_immersive("missing", true)).toBe(false);
  });

  test("the browser leaving fullscreen leaves immersive", async () => {
    const windows = new WindowsService();
    windows.init();
    try {
      const a = windows.open(app("a"));
      await enter_by_click(windows, a);
      expect(immersive(windows, a)).toBe(true);
      await document.exitFullscreen();
      await vi.waitFor(() => expect(immersive(windows, a)).toBe(false));
    } finally {
      windows.destroy();
    }
  });

  test("closing the last immersive window hands fullscreen back", async () => {
    const windows = new WindowsService();
    windows.init();
    try {
      const a = windows.open(app("a"));
      await enter_by_click(windows, a);
      windows.force_close(a);
      await vi.waitFor(() => expect(document.fullscreenElement).toBeNull());
    } finally {
      windows.destroy();
    }
  });

  test("an app's own element fullscreen on top neither leaves immersive nor loses the page's fullscreen", async () => {
    const windows = new WindowsService();
    windows.init();
    const stage = document.createElement("div");
    const button = document.createElement("button");
    button.textContent = "Stage full screen";
    button.onclick = () => void stage.requestFullscreen();
    document.body.append(stage, button);
    try {
      const a = windows.open(app("a"));
      await enter_by_click(windows, a);

      await userEvent.click(button);
      await vi.waitFor(() => expect(document.fullscreenElement).toBe(stage));
      expect(immersive(windows, a)).toBe(true);
      await document.exitFullscreen();
      await vi.waitFor(() => expect(document.fullscreenElement).toBe(document.documentElement));
      expect(immersive(windows, a)).toBe(true);

      await userEvent.click(button);
      await vi.waitFor(() => expect(document.fullscreenElement).toBe(stage));
      windows.set_immersive(a, false);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(document.fullscreenElement).toBe(stage);
      await document.exitFullscreen();
      await vi.waitFor(() => expect(document.fullscreenElement).toBeNull());
    } finally {
      stage.remove();
      button.remove();
      windows.destroy();
    }
  });

  test("minimizing, or showing the desktop, leaves immersive", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    windows.set_immersive(a, true);
    windows.toggle_minimize(a);
    expect(immersive(windows, a)).toBe(false);

    windows.toggle_minimize(a);
    windows.set_immersive(a, true);
    windows.toggle_desktop();
    expect(immersive(windows, a)).toBe(false);
  });
});

describe("win immersive", () => {
  const command = (windows: WindowsService) => windows_shell(windows).commands?.find((each) => each.id === "win immersive")!;

  test("mode then window, toggle by default", () => {
    const windows = new WindowsService();
    expect(bind(command(windows), tokenize(""))).toEqual({ mode: "toggle" });
    expect(bind(command(windows), tokenize("off 1a2b3c4d"))).toEqual({ mode: "off", id: "1a2b3c4d" });
    expect(() => bind(command(windows), tokenize("sideways"))).toThrow();
  });

  test("toggles the focused window, or the one named", () => {
    const windows = new WindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));

    immersive_command(windows, { mode: "toggle" });
    expect(windows.get(b)?.flags.has(WindowFlag.IMMERSIVE)).toBe(true);
    immersive_command(windows, { mode: "toggle" });
    expect(windows.get(b)?.flags.has(WindowFlag.IMMERSIVE)).toBe(false);
    immersive_command(windows, { mode: "on", id: a.slice(0, 8) });
    expect(windows.get(a)?.flags.has(WindowFlag.IMMERSIVE)).toBe(true);
    expect(windows.get_focused()).toBe(a);
  });
});
