import { afterEach, describe, expect, test, vi } from "vitest";
import type { AppInstance, DialogEntry, DialogsService, IService, Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import { WindowsService } from "../windows/service.svelte";
import { UiService } from "../ui/service.svelte";
import { UiOverlay } from "../ui/type";
import { run_in_effect } from "./effect-fixture.svelte";
import { ShortcutsService } from "./service.svelte";
import { ShellService } from "../shell/service.svelte";
import { ShortcutCategory } from "./type";

const app = (id: string) =>
  ({ id, manifest: { id, name: id }, component: new Promise(() => {}), props: {}, state: {} }) as unknown as AppInstance;

let shutdown: () => void;
let system_dialogs: DialogEntry[] = [];

// Not stub_service: its spread would read the getter once, and the tests change the dialogs as they go.
const dialogs_stub: IService & Pick<DialogsService, "system" | "show"> = {
  name: "dialogs",
  description: "dialogs stub",
  to_string: () => "dialogs stub",
  get system() {
    return system_dialogs;
  },
  show: async () => null,
};

async function boot(): Promise<Kernel> {
  system_dialogs = [];
  const booted = await boot_test_kernel({
    files: stub_service("files", { get_file: async () => null }),
    notifications: stub_service("notifications", { notify: vi.fn() }),
    windows: WindowsService,
    dialogs: dialogs_stub,
    ui: UiService,
    shell: ShellService,
    shortcuts: ShortcutsService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

afterEach(() => shutdown?.());

// Alt+Shift and Mod+K/Ctrl+K: the test machine may be a Mac, so press both Ctrl and Cmd for "mod".
function press(code: string, modifiers: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...modifiers });
  target.dispatchEvent(event);
  return event;
}

describe("ShortcutsService", () => {
  test("Alt+Shift+W closes the focused window", async () => {
    const kernel = await boot();
    const windows = kernel.service<WindowsService>("windows");
    windows.open(app("a"));
    const b = windows.open(app("b"));

    const event = press("KeyW", { altKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(windows.exists(b)).toBe(false));
    expect(windows.list()).toHaveLength(1);
  });

  test("a command shortcut leaves its key alone while the command isn't available", async () => {
    await boot();
    const event = press("KeyW", { altKey: true, shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  test("Mod+K toggles the launcher", async () => {
    const kernel = await boot();
    const ui = kernel.service<UiService>("ui");
    const mod = kernel.service<ShortcutsService>("shortcuts").mac ? { metaKey: true } : { ctrlKey: true };

    press("KeyK", mod);
    await vi.waitFor(() => expect(ui.overlay).toBe(UiOverlay.LAUNCHER));
    press("KeyK", mod);
    await vi.waitFor(() => expect(ui.overlay).toBeNull());
  });

  test("a window's own shortcut wins over a global one, only while it's focused", async () => {
    const kernel = await boot();
    const windows = kernel.service<WindowsService>("windows");
    const shortcuts = kernel.service<ShortcutsService>("shortcuts");
    const a = windows.open(app("a"));
    const b = windows.open(app("b"));

    const global = vi.fn();
    const own = vi.fn();
    shortcuts.register({ id: "test.global", keys: "alt+j", label: "", category: ShortcutCategory.APP, run: global });
    const dispose = shortcuts.register({ id: "test.own", keys: "alt+j", label: "", category: ShortcutCategory.APP, window: a, run: own });

    press("KeyJ", { altKey: true });
    expect(global).toHaveBeenCalledTimes(1);

    windows.focus(a);
    press("KeyJ", { altKey: true });
    expect(own).toHaveBeenCalledTimes(1);

    dispose();
    press("KeyJ", { altKey: true });
    expect(global).toHaveBeenCalledTimes(2);
    expect(windows.exists(b)).toBe(true);
  });

  test("registering from an effect runs the effect once", async () => {
    const kernel = await boot();
    const shortcuts = kernel.service<ShortcutsService>("shortcuts");
    const effect = run_in_effect(() =>
      shortcuts.register({ id: "test.effect", keys: "alt+k", label: "", category: ShortcutCategory.APP, run: () => {} })
    );
    expect(effect.runs()).toBe(1);
    expect(shortcuts.list().filter((shortcut) => shortcut.id === "test.effect")).toHaveLength(1);
    effect.stop();
    expect(shortcuts.list().some((shortcut) => shortcut.id === "test.effect")).toBe(false);
  });

  test("leaves keys alone in text fields, behind a system dialog, and when already handled", async () => {
    const kernel = await boot();
    const shortcuts = kernel.service<ShortcutsService>("shortcuts");
    const run = vi.fn();
    shortcuts.register({ id: "test.plain", keys: "shift+j", label: "", category: ShortcutCategory.APP, run });

    const input = document.createElement("input");
    document.body.append(input);
    press("KeyJ", { shiftKey: true }, input);
    input.remove();
    expect(run).not.toHaveBeenCalled();

    system_dialogs = [{} as DialogEntry];
    press("KeyJ", { shiftKey: true });
    expect(run).not.toHaveBeenCalled();
    system_dialogs = [];

    const handled = new KeyboardEvent("keydown", { code: "KeyJ", shiftKey: true, bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(run).not.toHaveBeenCalled();

    press("KeyJ", { shiftKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("suspend stops dispatch until every suspend has resumed", async () => {
    const kernel = await boot();
    const shortcuts = kernel.service<ShortcutsService>("shortcuts");
    const run = vi.fn();
    shortcuts.register({ id: "test.suspend", keys: "alt+j", label: "", category: ShortcutCategory.APP, run });

    const outer = shortcuts.suspend();
    const inner = shortcuts.suspend();
    expect(press("KeyJ", { altKey: true }).defaultPrevented).toBe(false);

    inner();
    inner();
    expect(shortcuts.suspended).toBe(true);
    press("KeyJ", { altKey: true });
    expect(run).not.toHaveBeenCalled();

    outer();
    expect(shortcuts.suspended).toBe(false);
    press("KeyJ", { altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("suspending from an effect runs the effect once", async () => {
    const kernel = await boot();
    const shortcuts = kernel.service<ShortcutsService>("shortcuts");
    const effect = run_in_effect(() => shortcuts.suspend());
    expect(effect.runs()).toBe(1);
    expect(shortcuts.suspended).toBe(true);
    effect.stop();
    expect(shortcuts.suspended).toBe(false);
  });
});
