import { afterEach, describe, expect, test } from "vitest";
import type { AppInstance, Kernel, WindowsService } from "$lib/core/api";
import { boot_test_kernel } from "../../kernel/test-kernel";
import { DialogsService } from "../dialogs/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { WindowsService as DesktopWindows } from "../windows/service.svelte";
import { ExtractService } from "./service.svelte";

// Vitest runs in an iframe, where Chrome refuses Picture-in-Picture: the popped-out path is covered by hand (ADR-043).

const app = (id: string) =>
  ({ id, manifest: { id, name: id }, component: new Promise(() => {}), props: {}, state: {} }) as unknown as AppInstance;

const Dummy = (() => {}) as never;

let shutdown: () => void;

async function boot(): Promise<Kernel> {
  const booted = await boot_test_kernel({
    windows: DesktopWindows,
    dialogs: DialogsService,
    notifications: NotificationsService,
    extract: ExtractService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const extract = (kernel: Kernel) => kernel.service<ExtractService>("extract");
const windows = (kernel: Kernel) => kernel.service<WindowsService>("windows");

afterEach(() => shutdown?.());

describe("ExtractService", () => {
  test("refuses a window with unsaved changes or that doesn't exist", async () => {
    const kernel = await boot();
    const id = windows(kernel).open(app("example"));
    expect(extract(kernel).can_pop(id)).toBe(true);

    windows(kernel).set_dirty(id, true);
    expect(extract(kernel).can_pop(id)).toBe(false);
    expect(await extract(kernel).pop(id)).toBe(false);
    expect(extract(kernel).can_pop("missing")).toBe(false);
    expect(extract(kernel).current).toBeNull();
  });

  test("a request the browser refuses leaves nothing out", async () => {
    const kernel = await boot();
    const id = windows(kernel).open(app("example"));

    expect(await extract(kernel).pop(id)).toBe(false);
    expect(extract(kernel).current).toBeNull();
    expect(extract(kernel).document).toBeNull();
    expect(await extract(kernel).bring_back()).toBe(true);
  });

  test("bringing back a dirty window asks first, as a sheet over it", async () => {
    const kernel = await boot();
    const id = windows(kernel).open(app("example"));
    windows(kernel).set_dirty(id, true);
    // Stands in for a popped-out window: the iframe can't open one.
    extract(kernel).current = id;
    const dialogs = kernel.service<DialogsService>("dialogs");

    const kept = extract(kernel).bring_back();
    expect(dialogs.for_window(id)).toHaveLength(1);
    dialogs.for_window(id)[0].resolve(false);
    expect(await kept).toBe(false);
    expect(extract(kernel).current).toBe(id);

    const discarded = extract(kernel).bring_back();
    dialogs.for_window(id)[0].resolve(true);
    expect(await discarded).toBe(true);
    expect(extract(kernel).current).toBeNull();
  });

  test("popping another window while a dirty one is out only asks to bring that one back", async () => {
    const kernel = await boot();
    const out = windows(kernel).open(app("example"));
    const other = windows(kernel).open(app("other"));
    windows(kernel).set_dirty(out, true);
    extract(kernel).current = out;
    const dialogs = kernel.service<DialogsService>("dialogs");
    const notifications = kernel.service<NotificationsService>("notifications");

    const popped = extract(kernel).pop(other);
    await Promise.resolve();
    dialogs.for_window(out)[0].resolve(true);
    expect(await popped).toBe(false);
    expect(extract(kernel).current).toBeNull();
    expect(notifications.all.some((entry) => entry.title === "example is back")).toBe(true);
  });

  test("with nothing out, system dialogs stay in the tab", async () => {
    const kernel = await boot();
    const dialogs = kernel.service<DialogsService>("dialogs");
    void dialogs.show(Dummy, {});
    expect(dialogs.system).toHaveLength(1);
    expect(dialogs.stack[0].origin).toBeNull();
  });

  test("a dialog follows the last input: the mini window's, until the tab is clicked", async () => {
    const kernel = await boot();
    const id = windows(kernel).open(app("example"));
    extract(kernel).current = id;
    extract(kernel).input_inside = true;
    const dialogs = kernel.service<DialogsService>("dialogs");

    void dialogs.show(Dummy, {});
    expect(dialogs.for_origin(id)).toHaveLength(1);
    expect(dialogs.system).toHaveLength(0);

    window.dispatchEvent(new PointerEvent("pointerdown"));
    expect(extract(kernel).input_inside).toBe(false);
    void dialogs.show(Dummy, {});
    expect(dialogs.system).toHaveLength(1);
  });
});
