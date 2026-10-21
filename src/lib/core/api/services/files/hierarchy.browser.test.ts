import { beforeEach, expect, test } from "vitest";
import { ensure_hierarchy, PATHS } from "./hierarchy";
import { clear_opfs, get_directory_at, get_root } from "./opfs";
import { split_path } from "./path";

beforeEach(() => clear_opfs());

test("builds every home folder, Templates included, and leaves a user's own Templates in place", async () => {
  const root = await get_root();
  const own = await root.getDirectoryHandle("Templates", { create: true });
  await (await own.getFileHandle("cv.warren", { create: true })).createWritable().then((writable) => writable.close());
  await root.removeEntry("home", { recursive: true }).catch(() => undefined);
  await root.getDirectoryHandle("etc", { create: true }).then((etc) => etc.removeEntry("hierarchy.json").catch(() => undefined));
  await ensure_hierarchy(root);
  for (const path of [PATHS.desktop, PATHS.documents, PATHS.downloads, PATHS.templates]) {
    expect(await get_directory_at(root, split_path(path)), path).not.toBeNull();
  }
  const templates = await get_directory_at(root, split_path(PATHS.templates));
  await expect(templates!.getFileHandle("cv.warren")).resolves.toBeDefined();
});
