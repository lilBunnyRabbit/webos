import { beforeEach, describe, expect, test, vi } from "vitest";
import * as opfs from "./opfs";
import { apply_renames } from "./rename-batch";
import { plan_renames, type RenameRule } from "./rename-pattern";
import { FilesService } from "./service.svelte";

let files: FilesService;
let folder: FileSystemDirectoryHandle;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
  folder = await files.create_directory(await files.get_directory("/home"), "batch");
});

async function seed(names: string[]): Promise<void> {
  for (const name of names) await files.create_file(folder, name, { content: name });
}

async function contents(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const item of await files.list(folder)) if (item.kind === "file") out[item.name] = await (await item.handle.getFile()).text();
  return out;
}

async function plan(names: string[], rule: RenameRule) {
  const listed = (await files.list(folder)).map((item) => item.name);
  return plan_renames(
    names.map((name) => ({ path: `/home/batch/${name}`, modified: null })),
    rule,
    new Map([["/home/batch", listed]])
  );
}

describe("apply_renames", () => {
  test("renames by pattern", async () => {
    await seed(["a.txt", "b.txt"]);
    await apply_renames(files, (await plan(["a.txt", "b.txt"], { pattern: "trip-{n:2}{ext}" })).steps);
    expect(await contents()).toEqual({ "trip-01.txt": "a.txt", "trip-02.txt": "b.txt" });
  });

  test("swaps and rotations go through temporary names", async () => {
    await seed(["1.txt", "2.txt", "3.txt"]);
    const rotation = await plan(["1.txt", "2.txt", "3.txt"], { pattern: "{n}{ext}", start: 2 });
    expect(rotation.steps.at(-1)?.problem).toBeNull();
    rotation.steps[2].new_name = "1.txt";
    await apply_renames(files, rotation.steps);
    expect(await contents()).toEqual({ "2.txt": "1.txt", "3.txt": "2.txt", "1.txt": "3.txt" });
  });

  test("a failure renames the finished steps back", async () => {
    await seed(["a.txt", "b.txt", "c.txt"]);
    const steps = (await plan(["a.txt", "b.txt", "c.txt"], { pattern: "new-{name}{ext}" })).steps;
    const rename = files.rename_entry.bind(files);
    vi.spyOn(files, "rename_entry").mockImplementation(async (handle, name, new_name) => {
      if (name === "c.txt") throw new Error("disk on fire");
      return rename(handle, name, new_name);
    });

    await expect(apply_renames(files, steps)).rejects.toThrow(/Couldn't rename "c.txt": disk on fire\. Nothing was renamed/);
    expect(await contents()).toEqual({ "a.txt": "a.txt", "b.txt": "b.txt", "c.txt": "c.txt" });
  });

  test("refuses a plan with problems", async () => {
    await seed(["a.txt", "b.txt"]);
    const blocked = await plan(["a.txt"], { pattern: "b{ext}" });
    await expect(apply_renames(files, blocked.steps)).rejects.toThrow(/problems/);
  });
});
