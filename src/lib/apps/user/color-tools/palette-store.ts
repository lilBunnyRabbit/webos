import type { FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { file_name_for, is_palette_name, PALETTES_DIR, parse_palette, serialize_palette, type Palette } from "./palette";

export interface PaletteEntry {
  path: string;
  name: string;
  preview: string[];
  count: number;
  modified: number;
}

const PREVIEW = 8;

export async function list_palettes(files: FilesService): Promise<PaletteEntry[]> {
  const directory = await files.get_directory(PALETTES_DIR);
  if (!directory) return [];
  const items = await files.list(directory, { include_metadata: true });
  const entries = await Promise.all(
    items.map(async (item): Promise<PaletteEntry | null> => {
      if (item.kind !== "file" || !is_palette_name(item.name)) return null;
      const palette = parse_palette(await (await files.read_file(item.handle)).text());
      if (!palette) return null;
      return {
        path: join_path(split_path(PALETTES_DIR), item.name),
        name: palette.name,
        preview: palette.colors.slice(0, PREVIEW).map((color) => color.css),
        count: palette.colors.length,
        modified: item.last_modified ?? 0,
      };
    })
  );
  return entries.filter((entry) => entry !== null).sort((a, b) => b.modified - a.modified);
}

async function documents(files: FilesService): Promise<FileSystemDirectoryHandle> {
  const existing = await files.get_directory(PALETTES_DIR);
  if (existing) return existing;
  const segments = split_path(PALETTES_DIR);
  return files.create_directory(await files.get_directory(join_path(segments.slice(0, -1))), segments.at(-1)!);
}

export async function save_new(files: FilesService, palette: Palette): Promise<string> {
  const handle = await files.create_file(await documents(files), file_name_for(palette.name), { content: serialize_palette(palette) });
  return join_path(split_path(PALETTES_DIR), handle.name);
}
