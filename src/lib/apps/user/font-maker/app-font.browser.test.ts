import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushSync } from "svelte";
import { boot_test_kernel, stub_service } from "$lib/core/api/kernel/test-kernel";
import * as opfs from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { NotificationsService, NotifyOptions } from "$lib/core/api/services/notifications/type";
import { build_family } from "./build";
import { add_stroke, create_project, type Stroke } from "./model";
import { FONT_DIRECTORY } from "$lib/core/api/services/settings/fonts";
import { SettingsService } from "$lib/core/api/services/settings/service.svelte";

let shutdown: () => Promise<void>;
let notified: NotifyOptions[] = [];

beforeEach(async () => {
  notified = [];
  await vi.waitFor(() => opfs.clear_opfs());
});
afterEach(async () => await shutdown?.());

async function boot() {
  const notifications = stub_service<NotificationsService>("NotificationsService", {
    notify: (_app, options) => {
      notified.push(options);
      return "id";
    },
  });
  const booted = await boot_test_kernel({ files: FilesService, notifications, settings: SettingsService });
  shutdown = booted.shutdown;
  return { files: booted.kernel.service<FilesService>("files"), settings: booted.kernel.service<SettingsService>("settings") };
}

const line = (x0: number, y0: number, x1: number, y1: number): Stroke => Array.from({ length: 11 }, (_, index) => [x0 + ((x1 - x0) * index) / 10, y0 + ((y1 - y0) * index) / 10, 0.5]);

function family_bytes(): Uint8Array<ArrayBuffer> {
  let project = create_project("Test Family");
  project = add_stroke(project, "o", line(100, 0, 100, 480));
  return build_family(project);
}

const faces_of = (family: string) => [...document.fonts].filter((face) => face.family.replaceAll('"', "") === family);
const app_font = (role: string) => document.documentElement.style.getPropertyValue(`--app-font-${role}`);

test("a family file is copied to /etc/fonts and every face loads with its weight and style", async () => {
  const { files, settings } = await boot();
  await files.create_file(await files.get_directory("/home"), "Test Family.ttc", { content: new Blob([family_bytes()]) });

  await settings.use_font("sans", "/home/Test Family.ttc");
  expect(settings.appearance.font.sans).toEqual({ kind: "file", name: "Test Family.ttc" });
  expect(await settings.installed_fonts()).toEqual(["Test Family.ttc"]);

  flushSync();
  await vi.waitFor(() => expect(app_font("sans")).toMatch(/^"webos-sans-\d+", "Inter"$/));
  const family = /"([^"]+)"/.exec(app_font("sans"))![1];
  const faces = faces_of(family).map((face) => `${face.weight} ${face.style}`);
  expect(faces.sort()).toEqual(["400 italic", "400 normal", "700 italic", "700 normal"]);
  expect(document.fonts.check(`italic 700 16px "${family}"`, "o")).toBe(true);

  await settings.remove_font("Test Family.ttc");
  expect(settings.appearance.font.sans).toEqual({ kind: "default" });
  flushSync();
  await vi.waitFor(() => expect(app_font("sans")).toBe(""));
  expect(faces_of(family)).toEqual([]);
  expect(await settings.installed_fonts()).toEqual([]);
});

test("a font file that's gone falls back to the default and says so", async () => {
  const first = await boot();
  await first.settings.use_font("mono", new File([family_bytes()], "Gone.ttc"));
  flushSync();
  await vi.waitFor(() => expect(app_font("mono")).not.toBe(""));
  await first.files.delete_entry(await first.files.get_directory(FONT_DIRECTORY), "Gone.ttc");
  await vi.waitFor(async () => expect(await (await first.files.get_file("/etc/settings.json"))?.text()).toContain("Gone.ttc"), { timeout: 3000 });
  await shutdown();

  const { settings } = await boot();
  flushSync();
  await vi.waitFor(() => expect(settings.appearance.font.mono).toEqual({ kind: "default" }));
  expect(notified.at(-1)?.title).toBe("Couldn't load Gone");
  expect(app_font("mono")).toBe("");
});
