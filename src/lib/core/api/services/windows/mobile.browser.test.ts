import { describe, expect, test, vi } from "vitest";
import type { AppInstance } from "../apps/type";
import { MobileWindowsService } from "./mobile.svelte";
import { CloseChoice } from "./close-guard";
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

  test("back handlers run newest first until one handles it, and go with the window", () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    const calls: string[] = [];

    windows.add_back_handler(a, () => (calls.push("app"), true));
    const dispose_sheet = windows.add_back_handler(a, () => (calls.push("sheet"), false));

    expect(windows.back(a)).toBe(true);
    expect(calls).toEqual(["sheet", "app"]);

    dispose_sheet();
    calls.length = 0;
    windows.back(a);
    expect(calls).toEqual(["app"]);

    windows.close(a);
    expect(windows.back(a)).toBe(false);
  });

  test("a dirty window asks first: Cancel keeps it, Don't save closes, Save closes only once saved (ADR-029)", async () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    windows.go_home();

    let choice: CloseChoice = CloseChoice.CANCEL;
    const prompt = vi.fn(async () => choice);
    windows.set_close_prompt(prompt);
    const save = vi.fn(async () => false);
    windows.set_title(a, "Notes.txt");
    windows.set_dirty(a, true, { save });
    expect(windows.has_dirty()).toBe(true);

    expect(await windows.close(a)).toBe(false);
    expect(prompt).toHaveBeenLastCalledWith({ id: a, title: "Notes.txt", can_save: true });
    // The sheet needs the window on screen.
    expect(windows.get_focused()).toBe(a);

    choice = CloseChoice.SAVE;
    expect(await windows.close(a)).toBe(false);
    expect(save).toHaveBeenCalledOnce();

    choice = CloseChoice.DISCARD;
    expect(await windows.close(a)).toBe(true);
    expect(windows.exists(a)).toBe(false);
  });

  test("without a prompt a dirty window refuses to close; force_close and clean windows never ask", async () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));
    windows.set_dirty(a, true);

    expect(await windows.close(a)).toBe(false);
    windows.close(b);
    expect(windows.exists(b)).toBe(false);
    expect(windows.force_close(a)).toBe(true);
    expect(windows.has_dirty()).toBe(false);
  });

  test("close_all closes clean windows at once, then asks each dirty one and stops at Cancel", async () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));
    const c = windows.open(app("c"));
    windows.set_dirty(a, true);
    windows.set_dirty(c, true);
    const asked: string[] = [];
    windows.set_close_prompt(async ({ id }) => {
      asked.push(id);
      return id === c ? CloseChoice.DISCARD : CloseChoice.CANCEL;
    });

    expect(await windows.close_all()).toBe(false);
    expect(windows.exists(b)).toBe(false);
    expect(asked).toEqual([c, a]);
    expect(windows.list()).toEqual([a]);
  });

  test("the guide puts its app on screen, and hides again (ADR-085)", () => {
    const windows = new MobileWindowsService();
    const a = windows.open(app("a"));
    windows.go_home();

    expect(windows.toggle_guide(a)).toBe(true);
    expect(windows.get_focused()).toBe(a);
    expect(windows.toggle_guide(a)).toBe(false);
    expect(windows.get(a)?.flags.has(WindowFlag.GUIDE)).toBe(false);
  });
});
