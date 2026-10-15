import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clear_opfs } from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { Method } from "$lib/core/utils/zip/format";
import { write_zip } from "$lib/core/utils/zip/write";
import { build_backup, open_backup, restore_backup, sizes } from "./backup";
import { BackupError } from "./type";

const meta = { version: "0.37.0", created: new Date("2026-10-15T09:30:00Z") };

let files: FilesService;
let releases: Array<() => void> = [];

async function root() {
  return files.get_root();
}

async function seed(path: string, text: string): Promise<void> {
  const segments = path.split("/").filter(Boolean);
  let directory = await root();
  for (const segment of segments.slice(0, -1))
    directory = await directory.getDirectoryHandle(segment, { create: true });
  await files.create_file(directory, segments.at(-1)!, { content: text, overwrite: true });
}

async function read(path: string): Promise<string | null> {
  return (await (await files.get_file(path))?.text()) ?? null;
}

function clear_app_storage(): void {
  for (const key of Object.keys(localStorage)) if (key.startsWith("app.")) localStorage.removeItem(key);
}

async function restore(blob: Blob): Promise<void> {
  releases.push(await restore_backup(await root(), await open_backup(blob), localStorage));
}

beforeEach(async () => {
  await clear_opfs();
  files = new FilesService();
  await files.init();
  clear_app_storage();
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
  clear_app_storage();
  localStorage.removeItem("kernel.test");
});

describe("backup", () => {
  test("restores every area it holds, app storage included, and nothing from /tmp", async () => {
    await seed("/home/Documents/a.txt", "alpha");
    await files.create_directory(await files.get_directory("/home"), "Empty");
    await seed("/etc/settings.json", '{"theme":"dark"}');
    await seed("/var/lib/session/session.json", "[1]");
    await seed("/tmp/scratch.txt", "temp");
    localStorage.setItem("app.notes.font", "mono");
    localStorage.setItem("kernel.test", "outside");

    const blob = await build_backup(await root(), ["files", "settings", "apps"], meta, localStorage);

    await seed("/home/Documents/a.txt", "changed");
    await seed("/home/Documents/new.txt", "added after the backup");
    await seed("/etc/settings.json", "{}");
    await seed("/var/lib/session/session.json", "[2]");
    localStorage.setItem("app.notes.font", "serif");
    localStorage.setItem("app.later.key", "added after the backup");

    await restore(blob);

    expect(await read("/home/Documents/a.txt")).toBe("alpha");
    expect(await read("/home/Documents/new.txt")).toBeNull();
    expect(await files.get_directory("/home/Empty")).not.toBeNull();
    expect(await read("/etc/settings.json")).toBe('{"theme":"dark"}');
    expect(await read("/var/lib/session/session.json")).toBe("[1]");
    expect(await read("/tmp/scratch.txt")).toBe("temp");
    expect(localStorage.getItem("app.notes.font")).toBe("mono");
    expect(localStorage.getItem("app.later.key")).toBeNull();
    expect(localStorage.getItem("kernel.test")).toBe("outside");

    const opened = await open_backup(blob);
    expect(opened.manifest).toMatchObject({ format: 1, version: "0.37.0", areas: ["files", "settings", "apps"] });
    expect(opened.archive.entries.some((entry) => entry.name.startsWith("tmp/"))).toBe(false);
  });

  test("leaves areas the backup doesn't hold alone", async () => {
    await seed("/home/a.txt", "backed up");
    await seed("/etc/settings.json", "old settings");
    localStorage.setItem("app.notes.font", "mono");
    const blob = await build_backup(await root(), ["files"], meta, localStorage);

    await seed("/home/a.txt", "changed");
    await seed("/etc/settings.json", "new settings");
    await seed("/var/lib/desktop/layout.json", "new layout");
    localStorage.setItem("app.notes.font", "serif");

    await restore(blob);

    expect(await read("/home/a.txt")).toBe("backed up");
    expect(await read("/etc/settings.json")).toBe("new settings");
    expect(await read("/var/lib/desktop/layout.json")).toBe("new layout");
    expect(localStorage.getItem("app.notes.font")).toBe("serif");
  });

  test("holds every FilesService write until released", async () => {
    await seed("/home/a.txt", "a");
    const blob = await build_backup(await root(), ["files"], meta, localStorage);
    const release = await restore_backup(await root(), await open_backup(blob), localStorage);

    await expect(seed("/var/lib/session/session.json", "stale")).rejects.toThrow(/on hold/);
    expect(await read("/var/lib/session/session.json")).toBeNull();

    release();
    await seed("/var/lib/session/session.json", "fresh");
    expect(await read("/var/lib/session/session.json")).toBe("fresh");
  });

  test("rejects a backup from a newer format and changes nothing", async () => {
    await seed("/home/a.txt", "kept");
    const manifest = {
      format: 2,
      version: "9.0.0",
      created: meta.created.toISOString(),
      areas: ["files"],
      local_storage: {},
    };
    const blob = await write_zip(
      [
        { name: "backup.json", data: new Blob([JSON.stringify(manifest)]) },
        { name: "home/a.txt", data: new Blob(["from the future"]) },
      ],
      { method: Method.DEFLATE }
    );

    await expect(open_backup(blob)).rejects.toThrow(/newer WebOS \(format 2\)/);
    expect(await read("/home/a.txt")).toBe("kept");
  });

  test("rejects a zip that isn't a backup", async () => {
    const blob = await write_zip([{ name: "photo.txt", data: new Blob(["hi"]) }], { method: Method.STORE });
    await expect(open_backup(blob)).rejects.toThrow(BackupError);
  });

  test("measures each area, app storage counted under App data", async () => {
    await seed("/home/a.txt", "12345");
    await seed("/etc/settings.json", "123");
    localStorage.setItem("app.x.k", "v");
    expect(await sizes(await root(), localStorage)).toMatchObject({ files: 5, apps: "app.x.k".length + 1 });
  });
});
