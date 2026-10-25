import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AppsService } from "$lib/core/api";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { parse_shortcut, serialize_shortcut } from "../apps/shortcut";
import { serialize_widget } from "../apps/widget";
import { DesktopFolder } from "./folder.svelte";

let folder: DesktopFolder;
let files: FilesService;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => folder?.destroy());

test("reloads after a change without reading the layout file again", async () => {
  // A second read would race the owner's own layout writes (NotReadableError / NotFoundError on a desktop drop).
  const read_layout = vi.fn(async () => "{}");
  const loaded = vi.fn();
  folder = new DesktopFolder({
    files: () => files,
    apps: () => ({ get: () => undefined }) as unknown as AppsService,
    read_layout,
    seed: async () => {},
    loaded,
  });
  await folder.init();

  await files.import_entries("/home/Desktop", [new File(["x"], "dropped.txt")]);
  flushSync();
  await vi.waitFor(() => expect(folder.names()).toEqual(["dropped.txt"]));

  expect(read_layout).toHaveBeenCalledTimes(1);
  expect(loaded).toHaveBeenCalledTimes(1);
});

test("lists a pinned widget as soon as the write resolves", async () => {
  const manifest = { widget: async () => ({}) };
  folder = new DesktopFolder({
    files: () => files,
    apps: () => ({ get: (id: string) => (id === "notes" ? manifest : undefined) }) as unknown as AppsService,
    read_layout: async () => "{}",
    seed: async () => {},
    loaded: () => {},
  });
  await folder.init();

  const name = await folder.write_widget("notes", { label: "Sticky", props: { note: "a" } });

  expect(name).toBe("Sticky.widget");
  expect(folder.get("Sticky.widget")).toMatchObject({ kind: "widget", app_id: "notes", props: { note: "a" } });
  flushSync();
  await vi.waitFor(async () => expect((await files.list(await folder.handle())).map((item) => item.name)).toEqual(["Sticky.widget"]));
  expect(folder.names()).toEqual(["Sticky.widget"]);
});

test("a widget's style is shown at once and kept in its file next to the size", async () => {
  const manifest = { widget: async () => ({}) };
  folder = new DesktopFolder({
    files: () => files,
    apps: () => ({ get: (id: string) => (id === "clock" ? manifest : undefined) }) as unknown as AppsService,
    read_layout: async () => "{}",
    seed: async () => {},
    loaded: () => {},
  });
  await folder.init();
  const name = await folder.write_widget("clock", { label: "Clock", size: { w: 3, h: 2 } });
  if (!name) throw new Error("no widget written");
  expect(folder.get(name)).toMatchObject({ style: "card" });

  const written = folder.write_widget_style(name, "clear");
  expect(folder.get(name)).toMatchObject({ style: "clear" });
  await written;
  await folder.write_widget_size(name, { w: 2, h: 2 });

  const file = await files.get_file(`/home/Desktop/${name}`);
  expect(JSON.parse((await file?.text()) ?? "")).toMatchObject({ app: "clock", w: 2, h: 2, style: "clear" });
  flushSync();
  await vi.waitFor(() => expect(folder.get(name)).toMatchObject({ style: "clear", size: { w: 2, h: 2 } }));
});

test("a shortcut or widget to a replaced app id shows as the app that took it over; the file stays (ADR-071)", async () => {
  const manifests = [
    { id: "game", replaces: [{ app: "old-games" }] },
    { id: "example", widget: async () => ({}), replaces: [{ app: "old-games", props: { mode: "count" } }] },
  ];
  folder = new DesktopFolder({
    files: () => files,
    apps: () =>
      ({
        get: (id: string) => manifests.find((manifest) => manifest.id === id),
        list: () => manifests.map((manifest) => [manifest.id, manifest]).values(),
      }) as unknown as AppsService,
    read_layout: async () => "{}",
    seed: async () => {},
    loaded: () => {},
  });
  const desktop = await files.get_directory("/home/Desktop");
  await files.create_file(desktop!, "Old Games.desktop", { content: serialize_shortcut({ app_id: "old-games" }) });
  await files.create_file(desktop!, "Count.widget", { content: serialize_widget({ app: "old-games", props: { mode: "count", count: 2 }, w: 2, h: 2 }) });
  await folder.init();

  expect(folder.get("Old Games.desktop")).toMatchObject({ kind: "shortcut", app_id: "game" });
  expect(folder.get("Count.widget")).toMatchObject({ kind: "widget", app_id: "example", props: { count: 2 } });
  const file = await files.get_file("/home/Desktop/Old Games.desktop");
  expect(parse_shortcut(await file!.text())?.app_id).toBe("old-games");
});
