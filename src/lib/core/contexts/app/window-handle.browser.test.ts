import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import kernel, { type AppInstance, type AppManifest, type AppSheetLoader, type AppsService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { DialogsService } from "$lib/core/api/services/dialogs/service.svelte";
import { WindowsService } from "$lib/core/api/services/windows/service.svelte";
import { create_window_handle } from "./window-handle";

const sheet = (async () => ({ default: (() => {}) as never })) satisfies AppSheetLoader;

const PROVIDERS: Record<string, Partial<AppManifest>> = {
  scanner: { id: "scanner", provides: { scan: sheet, broken: () => Promise.reject(new Error("chunk failed")) } },
};

let windows: WindowsService;
let dialogs: DialogsService;
let catalogue: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

function window_for(id: string): string {
  return windows.open({ id, manifest: { id, name: id }, component: new Promise(() => {}), props: {}, state: {} } as unknown as AppInstance);
}

/** Loosely typed: the keys here aren't in `AppSheets`, which is what a typo looks like to the compiler. */
function request(window_id: string, key: string, input?: unknown): Promise<unknown> {
  return (create_window_handle(window_id).request as (key: string, input?: unknown) => Promise<unknown>)(key, input);
}

beforeEach(async () => {
  catalogue = vi.fn(async () => true);
  windows = new WindowsService(kernel);
  windows.init();
  kernel.services.set("windows", windows);
  dialogs = new DialogsService(kernel);
  kernel.services.set("dialogs", dialogs);
  dialogs.init();
  kernel.services.set(
    "apps",
    stub_service<AppsService>("apps", {
      get: (id) => PROVIDERS[id] as AppManifest | undefined,
      catalogue,
      load: async (id) => PROVIDERS[id] as AppManifest | undefined,
    })
  );
});

afterEach(() => {
  dialogs.destroy();
  windows.destroy?.();
  for (const name of ["apps", "dialogs", "windows"]) kernel.services.delete(name);
});

describe("WindowHandle.request (ADR-079)", () => {
  test("opens the provider's sheet over the window with the input, and resolves what it hands back", async () => {
    const id = window_for("caller");
    const answer = request(id, "scanner::scan", { source: "photo" });
    await vi.waitFor(() => expect(dialogs.for_window(id)).toHaveLength(1));
    const [entry] = dialogs.for_window(id);
    expect(entry.props).toEqual({ input: { source: "photo" } });
    entry.resolve("straightened");
    expect(await answer).toBe("straightened");
  });

  test("resolves null when the window closes under the sheet", async () => {
    const id = window_for("caller");
    const answer = request(id, "scanner::scan");
    await vi.waitFor(() => expect(dialogs.for_window(id)).toHaveLength(1));
    await windows.close(id);
    expect(await answer).toBeNull();
  });

  test("resolves null when the sheet's code fails to load, and opens nothing", async () => {
    const id = window_for("caller");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await request(id, "scanner::broken")).toBeNull();
    expect(dialogs.for_window(id)).toEqual([]);
  });

  test("resolves null for an app or kind nobody provides, after asking for the full catalogue", async () => {
    const id = window_for("caller");
    expect(await request(id, "nobody::scan")).toBeNull();
    expect(catalogue).toHaveBeenCalledOnce();
    expect(await request(id, "scanner::print")).toBeNull();
    expect(await request(id, "no-separator")).toBeNull();
    expect(dialogs.stack).toEqual([]);
  });

  test("resolves null when the app's manifest can't load (offline, not installed)", async () => {
    const id = window_for("caller");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    kernel.services.set("apps", stub_service<AppsService>("apps", { get: () => undefined, catalogue: async () => false, load: () => Promise.reject(new Error("offline")) }));
    expect(await request(id, "scanner::scan")).toBeNull();
  });
});
