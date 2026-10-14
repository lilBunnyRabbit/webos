import { afterEach, describe, expect, test, vi } from "vitest";
import type { AppInstance, Kernel, WindowsService } from "$lib/core/api";
import { boot_test_kernel } from "../../kernel/test-kernel";
import { DialogsService } from "../dialogs/service.svelte";
import { WindowsService as DesktopWindows } from "../windows/service.svelte";
import { MobileWindowsService } from "../windows/mobile.svelte";
import { UiService } from "./service.svelte";
import { UiOverlay } from "./type";

const app = (id: string) =>
  ({ id, manifest: { id, name: id }, component: new Promise(() => {}), props: {}, state: {} }) as unknown as AppInstance;

const Dummy = (() => {}) as never;

let shutdown: () => void;

async function boot(platform: "desktop" | "mobile" = "desktop"): Promise<Kernel> {
  // Kernel reads `?platform=` once, at construction.
  history.replaceState(null, "", `${location.pathname}?platform=${platform}`);
  const booted = await boot_test_kernel({
    windows: platform === "mobile" ? MobileWindowsService : DesktopWindows,
    dialogs: DialogsService,
    ui: UiService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const ui = (kernel: Kernel) => kernel.service<UiService>("ui");
const dialogs = (kernel: Kernel) => kernel.service<DialogsService>("dialogs");
const windows = (kernel: Kernel) => kernel.service<WindowsService>("windows");

afterEach(() => {
  shutdown?.();
  history.replaceState(null, "", location.pathname);
});

describe("UiService.back", () => {
  test("overlay, then the top system dialog, then the focused window's sheet, then the app", async () => {
    const kernel = await boot();
    const id = windows(kernel).open(app("example"));
    const app_back = vi.fn(() => true);
    windows(kernel).add_back_handler(id, app_back);

    const sheet = dialogs(kernel).show(Dummy, {}, { window: id });
    const menu = dialogs(kernel).menu([], { anchor: { x: 0, y: 0 } });
    ui(kernel).open(UiOverlay.LAUNCHER);

    expect(ui(kernel).back()).toBe(true);
    // Overlay and home changes run inside a view transition, which starts on the next frame.
    await vi.waitFor(() => expect(ui(kernel).overlay).toBeNull());
    expect(ui(kernel).back()).toBe(true);
    await expect(menu).resolves.toBeNull();
    expect(ui(kernel).back()).toBe(true);
    await expect(sheet).resolves.toBeNull();
    expect(app_back).not.toHaveBeenCalled();
    expect(ui(kernel).back()).toBe(true);
    expect(app_back).toHaveBeenCalledOnce();
  });

  test("a non-dismissible dialog swallows back", async () => {
    const kernel = await boot();
    void dialogs(kernel).show(Dummy, {}, { dismissible: false });
    expect(ui(kernel).back()).toBe(true);
    expect(dialogs(kernel).system).toHaveLength(1);
  });

  test("desktop: nothing left to take it", async () => {
    const kernel = await boot();
    expect(ui(kernel).back()).toBe(false);
    windows(kernel).open(app("example"));
    expect(ui(kernel).back()).toBe(false);
  });

  test("mobile: the app goes home", async () => {
    const kernel = await boot("mobile");
    windows(kernel).open(app("example"));
    expect(windows(kernel).get_focused()).not.toBeNull();
    expect(ui(kernel).back()).toBe(true);
    await vi.waitFor(() => expect(windows(kernel).get_focused()).toBeNull());
  });
});

describe("back guard", () => {
  test("armed on a gesture, browser back runs back() and disarms", async () => {
    const kernel = await boot();
    expect(ui(kernel).armed).toBe(false);

    window.dispatchEvent(new PointerEvent("pointerup"));
    expect(ui(kernel).armed).toBe(true);
    expect(history.state).toEqual({ webos: "back-guard" });

    ui(kernel).open(UiOverlay.LAUNCHER);
    history.back();
    await vi.waitFor(() => expect(ui(kernel).armed).toBe(false));
    expect(ui(kernel).overlay).toBeNull();
  });
});
