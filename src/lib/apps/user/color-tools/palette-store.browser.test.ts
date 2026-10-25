import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { json_file } from "$lib/core/contexts/app";
import { add_color, create_palette, PALETTES_DIR, PaletteFileSchema, parse_palette } from "./palette";
import { list_palettes, save_new } from "./palette-store";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

beforeEach(async () => {
  const directory = await files.get_directory(PALETTES_DIR);
  if (!directory) return;
  for (const item of await files.list(directory)) {
    if (item.name.endsWith(".palette")) await files.delete_entry(directory, item.name);
  }
});

describe("palette files", () => {
  test("new palettes get free names in Documents and show in the list", async () => {
    const palette = create_palette("Sea", [{ name: "deep", css: "oklch(0.4 0.1 220)" }]);
    const first = await save_new(files, palette);
    const second = await save_new(files, palette);
    expect(first).toBe(`${PALETTES_DIR}/Sea.palette`);
    expect(second).toBe(`${PALETTES_DIR}/Sea (1).palette`);
    const entries = await list_palettes(files);
    expect(entries.map((entry) => entry.path).sort()).toEqual([first, second].sort());
    expect(entries[0]).toMatchObject({ name: "Sea", count: 1, preview: ["oklch(0.4 0.1 220)"] });
  });

  test("an edit through the open file is saved to disk", async () => {
    const path = await save_new(files, create_palette("Edit"));
    const cell = json_file(path, null, PaletteFileSchema);
    try {
      await vi.waitFor(() => expect(cell.value).not.toBeNull());
      cell.value = add_color(cell.value!, { name: "red", css: "#ff0000" });
      await vi.waitFor(async () => {
        const saved = parse_palette(await (await files.get_file(path))!.text());
        expect(saved?.colors).toEqual([{ name: "red", css: "#ff0000" }]);
      });
    } finally {
      cell.release();
    }
  });

  test("invalid files are left out of the list", async () => {
    const directory = await files.get_directory(PALETTES_DIR);
    await files.create_file(directory, "broken.palette", { content: "{" });
    await files.create_file(directory, "odd.palette", { content: JSON.stringify({ version: 1, name: "x", colors: [{ name: "", css: "nope" }] }) });
    expect(await list_palettes(files)).toEqual([]);
  });
});
