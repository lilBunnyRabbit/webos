import { beforeEach, expect, test, vi } from "vitest";
import * as opfs from "./opfs";
import { FilesService } from "./service.svelte";
import { parent_path } from "./path";

let files: FilesService;
let picked: FileSystemFileHandle;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
  const disk = await (await opfs.get_root()).getDirectoryHandle("disk", { create: true });
  vi.stubGlobal(
    "showSaveFilePicker",
    async ({ suggestedName }: { suggestedName: string }) =>
      (picked = await disk.getFileHandle(suggestedName, { create: true }))
  );
});

async function write(path: string, content: string) {
  const folder = await files.get_directory(parent_path(path));
  await files.create_file(folder, path.split("/").pop()!, { content, overwrite: true });
}

test("the app's file reaches the picked file even under another name, and every save updates it", async () => {
  const path = (await files.save_to_device("sketch"))!;
  await write(`${path}.tape`, "one");
  expect(await (await picked.getFile()).text()).toBe("one");
  await write(`${path}.tape`, "two");
  expect(await (await picked.getFile()).text()).toBe("two");
});

test("a second file goes to downloads, and the first isn't sent again", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const path = (await files.save_to_device("sheet.png"))!;
  await write(path, "png");
  await write(path.replace(".png", ".json"), "{}");
  expect(click).toHaveBeenCalledTimes(1);
  expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("sheet.json");
  expect(await (await picked.getFile()).text()).toBe("png");
});

test("a picked file the browser won't write is downloaded instead, then every later save too", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("showSaveFilePicker", async () => ({
    name: "font.fontmaker",
    kind: "file",
    createWritable: async () => {
      throw new DOMException("not allowed", "NotAllowedError");
    },
  }));
  const path = (await files.save_to_device("font.fontmaker"))!;
  await write(path, "one");
  await write(path, "two");
  expect(click).toHaveBeenCalledTimes(2);
  expect((click.mock.contexts[1] as HTMLAnchorElement).download).toBe("font.fontmaker");
});
