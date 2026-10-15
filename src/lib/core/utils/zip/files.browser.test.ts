import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { extract_entries, item_at, write_at } from "./files";
import { all_sources } from "./create";
import { Method } from "./format";
import { read_zip } from "./read";
import { write_zip } from "./write";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  kernel.services.delete("files");
});

async function seed(path: string, text: string): Promise<void> {
  const segments = path.split("/").filter(Boolean);
  let directory = await files.get_root();
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: true });
  await files.create_file(directory, segments.at(-1)!, { content: text, overwrite: true });
}

async function read(path: string): Promise<string | null> {
  return (await (await files.get_file(path))?.text()) ?? null;
}

describe("archive files", () => {
  test("zips a folder from OPFS and extracts it into a new folder next to it", async () => {
    await seed("/home/Docs/a.txt", "alpha ".repeat(100));
    await seed("/home/Docs/sub/b.md", "# b");
    await (await files.get_directory("/home/Docs"))!.getDirectoryHandle("empty", { create: true });

    const item = await item_at("/home/Docs");
    expect(item).toMatchObject({ name: "Docs", directory: true, files: 2, size: 603 });

    await write_at("/home/Docs.zip", await write_zip(all_sources([item!]), { method: Method.DEFLATE }));
    const zip = (await files.get_file("/home/Docs.zip"))!;
    const archive = await read_zip(zip);
    expect(archive.entries.map((entry) => entry.name).sort()).toEqual(["Docs/", "Docs/a.txt", "Docs/empty/", "Docs/sub/", "Docs/sub/b.md"]);

    let bytes = 0;
    const result = await extract_entries(zip, archive.entries, "/home", "Docs", { on_bytes: (n) => (bytes += n) });
    expect(result).toEqual({ path: "/home/Docs (1)", files: 2, skipped: [] });
    expect(bytes).toBe(603);
    expect(await read("/home/Docs (1)/Docs/a.txt")).toBe("alpha ".repeat(100));
    expect(await read("/home/Docs (1)/Docs/sub/b.md")).toBe("# b");
    expect(await files.get_directory("/home/Docs (1)/Docs/empty")).not.toBeNull();
  });

  test("keeps both when an archive holds the same name twice", async () => {
    const zip = await write_zip(
      [
        { name: "x.txt", data: new Blob(["one"]) },
        { name: "./x.txt", data: new Blob(["two"]) },
      ],
      { method: Method.STORE }
    );
    const archive = await read_zip(zip);
    const result = await extract_entries(zip, archive.entries, "/home", "dupes", {});
    expect(result.files).toBe(2);
    expect(await read("/home/dupes/x.txt")).toBe("one");
    expect(await read("/home/dupes/x (1).txt")).toBe("two");
  });

  test("returns null for a path that's gone", async () => {
    expect(await item_at("/home/nope")).toBeNull();
  });
});
