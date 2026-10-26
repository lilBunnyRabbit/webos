import { flushSync, mount, unmount } from "svelte";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import kernel, { ShortcutCategory, type ListedShortcut } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SettingsService } from "$lib/core/api/services/settings/service.svelte";
import Host from "./fixtures/settings-host.svelte";
import type { SectionId } from "./ids";
import { PAGES } from "./pages";
import { is_page, settings_for } from "./search";

const shortcut = (category: ShortcutCategory): ListedShortcut => ({ id: category, keys: "mod+k", label: category, category, run: () => {} }) as ListedShortcut;

const STUBS = {
  dialogs: stub_service("dialogs", { system: [] }),
  apps: stub_service("apps", { get: () => undefined, listings: () => [], launch: () => "" }),
  version: stub_service("version", {
    info: { version: "1.0.0", commit: "abc", branch: "master", buildTime: "2026-10-21T00:00:00Z" },
    changelog: [],
    unseen: [],
    update_available: null,
    is_checking: false,
    load_changelog: async () => [],
  }),
  backup: stub_service("backup", { activity: null, last: null, sizes: async () => ({ files: 0, settings: 0, apps: 0 }) }),
  scheduler: stub_service("scheduler", { triggers: false }),
  shortcuts: stub_service("shortcuts", {
    mac: false,
    list: () => [shortcut(ShortcutCategory.WINDOW), shortcut(ShortcutCategory.APPS), shortcut(ShortcutCategory.SYSTEM)],
  }),
  shell: stub_service("shell", {}),
  speech: stub_service("speech", { supported: true, voices: [], speaking: null, queued: 0, speak: () => {}, stop: () => {} }),
  offline: stub_service("offline", { online: true, syncing: false, picked: new Set(), is_picked: () => false, status: () => "not-saved" }),
};

let host: ReturnType<typeof mount> | null = null;

async function open(props: { section?: SectionId; setting?: string }): Promise<HTMLElement> {
  const target = document.createElement("div");
  target.style.cssText = "container-type: inline-size; width: 900px; height: 700px";
  document.body.append(target);
  host = mount(Host, { target, props });
  await new Promise((resolve) => setTimeout(resolve));
  flushSync();
  return target;
}

beforeAll(async () => {
  await clear_opfs();
  const files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
  kernel.services.set("notifications", new NotificationsService());
  const settings = new SettingsService(kernel);
  await settings.init();
  kernel.services.set("settings", settings);
  for (const [name, service] of Object.entries(STUBS)) kernel.services.set(name, service);
});

afterEach(() => {
  if (host) unmount(host);
  host = null;
  document.body.replaceChildren();
  for (const key of Object.keys(localStorage)) if (key.startsWith("app.settings.")) localStorage.removeItem(key);
});

afterAll(async () => {
  await kernel.service<SettingsService>("settings").destroy?.();
  for (const name of ["files", "notifications", "settings", ...Object.keys(STUBS)]) kernel.services.delete(name);
});

describe("Settings search index", () => {
  test.each(settings_for(kernel.platform).filter((entry) => !is_page(entry)).map((entry) => [entry.id, entry]))("%s has its anchor", async (id, entry) => {
    const root = await open({ setting: id });
    const page = PAGES.find((item) => item.value === entry.page)!;
    await vi.waitFor(() => expect(root.querySelector(`[data-setting="${id}"]`)).not.toBeNull());
    expect(root.querySelector("h1")?.textContent).toContain(entry.sub ? "" : page.label);
  });

  test("a page id opens the page, and appearance still means Theme", async () => {
    let root = await open({ section: "interface" });
    expect(root.querySelector("h1")?.textContent).toBe("Text & interface");
    unmount(host!);
    root = await open({ section: "appearance" });
    expect(root.querySelector("h1")?.textContent).toBe("Theme");
  });

  test("a setting link rings its row", async () => {
    const root = await open({ setting: "text-size" });
    await vi.waitFor(() => expect(root.querySelector('[data-setting="text-size"]')?.hasAttribute("data-targeted")).toBe(true));
  });

  test("typing in search and pressing Enter lands on the row", async () => {
    const root = await open({});
    const field = root.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    field.focus();
    field.value = "show seconds";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(root.querySelector('[role="option"]')?.textContent).toContain("Show seconds");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.querySelector('[data-setting="taskbar-seconds"]')?.hasAttribute("data-targeted")).toBe(true));
    expect(root.querySelector("h1")?.textContent).toBe("Taskbar");
  });
});
