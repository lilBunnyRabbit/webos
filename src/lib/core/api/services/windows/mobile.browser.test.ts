import { describe, expect, test } from "vitest";
import type { AppInstance } from "../apps/type";
import { MobileWindowsService } from "./mobile.svelte";
import { WindowFlag, type WindowSnapshot } from "./type";

function app(id: string, flags: WindowFlag[] = []): AppInstance {
  return {
    id,
    manifest: { id, name: id, defaults: { flags } },
    component: new Promise(() => {}),
    props: {},
    state: {},
  } as unknown as AppInstance;
}

describe("MobileWindowsService", () => {
  test("opening puts the app on screen, home leaves it running", () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));

    expect(windows.get_focused()).toBe(b);
    expect(windows.recent()).toEqual([b, a]);

    windows.go_home();
    expect(windows.get_focused()).toBeNull();
    expect(windows.list()).toHaveLength(2);

    windows.focus(a);
    expect(windows.get_focused()).toBe(a);
    expect(windows.recent()).toEqual([a, b]);
  });

  test("closing the app on screen goes home instead of surfacing another", () => {
    const windows = new MobileWindowsService();
    windows.open(app("a"));
    const b = windows.open(app("b"));

    windows.close(b);
    expect(windows.get_focused()).toBeNull();
    expect(windows.list()).toHaveLength(1);
  });

  test("minimize sends the on-screen app home, maximize does nothing", () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a", [WindowFlag.MAXIMIZED, WindowFlag.DEBUG]));

    expect([...windows.get(a)!.flags]).toEqual([WindowFlag.DEBUG]);
    expect(windows.toggle_maximize()).toBe(false);
    expect(windows.toggle_minimize(a)).toBe(true);
    expect(windows.get_focused()).toBeNull();
    expect(windows.toggle_minimize(a)).toBe(false);
    expect(windows.get_focused()).toBe(a);
  });

  test("restore keeps the order, drops geometry flags and lands on home", () => {
    const windows = new MobileWindowsService();
    const snapshot = (app_id: string): WindowSnapshot => ({
      app_id,
      bounds: { x: 10, y: 10, width: 100, height: 100 },
      flags: [WindowFlag.MINIMIZED],
      snap_zone: "left",
    });

    const result = windows.restore([snapshot("a"), snapshot("gone"), snapshot("b")], ({ app_id }) =>
      app_id === "gone" ? null : app(app_id)
    );

    expect(result.restored).toHaveLength(2);
    expect(result.skipped.map(({ app_id }) => app_id)).toEqual(["gone"]);
    expect(windows.get_focused()).toBeNull();
    expect(windows.recent().map((id) => windows.get(id)!.app.id)).toEqual(["b", "a"]);
    expect(windows.get(result.restored[0])!.flags.size).toBe(0);
    expect(windows.get(result.restored[0])!.snap_zone).toBeNull();
  });
});
