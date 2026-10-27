import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { AppCategory, type AppListing, type AppManifest } from "../apps/type";
import { achievements_path, parse_record, serialize_record } from "./persistence";
import { AchievementsService } from "./service.svelte";
import type { Achievement } from "./type";

const DEFS: Achievement[] = [
  { id: "first-win", title: "Cleared", text: "Win a game." },
  { id: "wins-3", title: "Regular", text: "Win 3 games.", goal: 3 },
  { id: "hidden", title: "Bare hands", text: "Win without a flag.", secret: true },
];

const manifest = { id: "mines", name: "Mines", category: AppCategory.GAMES, system: false, icon: () => {}, achievements: DEFS } as unknown as AppManifest;
const listing = { ...manifest, achievement_count: DEFS.length } as AppListing;

const shutdowns: Array<() => Promise<void>> = [];

async function open_tab() {
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    apps: stub_service("apps", {
      get: (id: string) => (id === "mines" ? manifest : undefined) as never,
      load: async (id: string) => (id === "mines" ? manifest : undefined) as never,
      listings: () => [listing],
      usage: () => null,
    }),
    achievements: AchievementsService,
  });
  shutdowns.push(booted.shutdown);
  return {
    achievements: booted.kernel.service<AchievementsService>("achievements"),
    notifications: booted.kernel.service<NotificationsService>("notifications"),
    files: booted.kernel.service<FilesService>("files"),
  };
}

async function read(files: FilesService) {
  return parse_record((await (await files.get_file(achievements_path("mines")))?.text()) ?? null);
}

const toasts = (notifications: NotificationsService) => notifications.all.map((item) => item.title);

beforeEach(async () => {
  await opfs.clear_opfs();
});

afterEach(async () => {
  for (const shutdown of shutdowns.splice(0)) await shutdown();
  vi.restoreAllMocks();
});

describe("AchievementsService", () => {
  test("achieve saves the unlock and toasts once", async () => {
    const tab = await open_tab();
    tab.achievements.achieve("mines", "first-win");
    tab.achievements.achieve("mines", "first-win");
    await tab.achievements.idle();
    expect(Object.keys((await read(tab.files)).unlocked)).toEqual(["first-win"]);
    expect(toasts(tab.notifications)).toEqual(["Achievement: Cleared"]);
    tab.achievements.achieve("mines", "first-win");
    await tab.achievements.idle();
    expect(toasts(tab.notifications)).toHaveLength(1);
  });

  test("progress unlocks at the goal and keeps the highest count", async () => {
    const tab = await open_tab();
    tab.achievements.progress("mines", "wins-3", 2);
    tab.achievements.progress("mines", "wins-3", 1);
    await tab.achievements.idle();
    expect((await read(tab.files)).progress["wins-3"]).toBe(2);
    expect(tab.notifications.all).toHaveLength(0);
    tab.achievements.progress("mines", "wins-3", 3);
    await tab.achievements.idle();
    expect((await read(tab.files)).unlocked["wins-3"]).toBeTypeOf("number");
    expect(toasts(tab.notifications)).toEqual(["Achievement: Regular"]);
  });

  test("an id the manifest doesn't declare warns and saves nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tab = await open_tab();
    tab.achievements.achieve("mines", "nope");
    await tab.achievements.idle();
    expect(warn).toHaveBeenCalled();
    expect(await tab.files.get_file(achievements_path("mines"))).toBeNull();
  });

  test("two tabs never lose each other's unlocks or toast twice", async () => {
    const one = await open_tab();
    const two = await open_tab();
    one.achievements.achieve("mines", "first-win");
    await one.achievements.idle();
    two.achievements.progress("mines", "wins-3", 1);
    two.achievements.achieve("mines", "first-win");
    await two.achievements.idle();
    const saved = await read(one.files);
    expect(Object.keys(saved.unlocked)).toEqual(["first-win"]);
    expect(saved.progress["wins-3"]).toBe(1);
    expect(toasts(one.notifications)).toEqual(["Achievement: Cleared"]);
    expect(two.notifications.all).toHaveLength(0);
  });

  test("two tabs unlocking different ones at once both keep theirs after a reload", async () => {
    const one = await open_tab();
    const two = await open_tab();
    one.achievements.achieve("mines", "first-win");
    two.achievements.achieve("mines", "hidden");
    one.achievements.progress("mines", "wins-3", 2);
    await Promise.all([one.achievements.idle(), two.achievements.idle()]);
    const three = await open_tab();
    three.achievements.list("mines");
    await three.achievements.idle();
    const unlocked = three.achievements.list("mines").filter((entry) => entry.unlocked && !entry.builtin);
    expect(unlocked.map((entry) => entry.def.id).sort()).toEqual(["first-win", "hidden"]);
    expect(three.achievements.list("mines").find((entry) => entry.def.id === "wins-3")?.progress).toBe(2);
    expect(toasts(one.notifications)).toEqual(["Achievement: Cleared"]);
    expect(toasts(two.notifications)).toEqual(["Achievement: Bare hands"]);
  });

  test("a failed write keeps it locked and toasts nothing; the next report saves it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tab = await open_tab();
    const create = vi.spyOn(tab.files, "create_file").mockRejectedValueOnce(new Error("disk full"));
    tab.achievements.achieve("mines", "first-win");
    await tab.achievements.idle();
    expect(tab.achievements.list("mines")[0].unlocked).toBe(false);
    expect(tab.notifications.all).toHaveLength(0);
    create.mockRestore();
    tab.achievements.achieve("mines", "first-win");
    await tab.achievements.idle();
    expect(Object.keys((await read(tab.files)).unlocked)).toEqual(["first-win"]);
    expect(toasts(tab.notifications)).toEqual(["Achievement: Cleared"]);
  });

  test("progress below a cleared file's old maximum still saves", async () => {
    const tab = await open_tab();
    tab.achievements.progress("mines", "wins-3", 2);
    await tab.achievements.idle();
    await tab.files.create_file(await tab.files.get_directory("/var/lib/apps/mines"), "achievements.json", {
      content: serialize_record({ unlocked: {}, progress: {} }),
      overwrite: true,
    });
    tab.achievements.progress("mines", "wins-3", 1);
    await tab.achievements.idle();
    expect((await read(tab.files)).progress["wins-3"]).toBe(1);
    expect(tab.achievements.list("mines")[1].progress).toBe(1);
  });

  test("list shows declared then built-in entries from the file, secrets included", async () => {
    const tab = await open_tab();
    let dir = await tab.files.get_root();
    for (const segment of ["var", "lib", "apps", "mines"]) dir = await dir.getDirectoryHandle(segment, { create: true });
    await tab.files.create_file(dir, "achievements.json", { content: serialize_record({ unlocked: { hidden: 5 }, progress: { "wins-3": 2 } }), overwrite: true });
    tab.achievements.list("mines");
    await tab.achievements.idle();
    const list = tab.achievements.list("mines");
    expect(list.map((entry) => entry.def.id)).toEqual(["first-win", "wins-3", "hidden", "os.first", "os.hour", "os.days-5", "os.hours-10", "os.days-30"]);
    expect(list.find((entry) => entry.def.id === "hidden")).toMatchObject({ unlocked: true, unlocked_at: 5 });
    expect(list.find((entry) => entry.def.id === "wins-3")).toMatchObject({ progress: 2, progress_text: "2 / 3" });
    expect(tab.achievements.list("unknown")).toEqual([]);
    expect(tab.achievements.list().length).toBe(list.length);
  });
});
