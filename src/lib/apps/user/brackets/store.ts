import type { FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { BRACKETS_DIR, BracketSchema, file_name_for, is_bracket_name, serialize_bracket, type Bracket, type FormatKind } from "./bracket";

export interface BracketEntry {
  path: string;
  name: string;
  format: FormatKind;
  players: number;
  modified: number;
}

export function parse_bracket(text: string): Bracket | null {
  try {
    const result = BracketSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function list_brackets(files: FilesService): Promise<BracketEntry[]> {
  const directory = await files.get_directory(BRACKETS_DIR);
  if (!directory) return [];
  const items = await files.list(directory, { include_metadata: true });
  const entries = await Promise.all(
    items.map(async (item): Promise<BracketEntry | null> => {
      if (item.kind !== "file" || !is_bracket_name(item.name)) return null;
      const bracket = parse_bracket(await (await files.read_file(item.handle)).text());
      if (!bracket) return null;
      return {
        path: join_path(split_path(BRACKETS_DIR), item.name),
        name: bracket.name,
        format: bracket.format.kind,
        players: bracket.players.length,
        modified: item.last_modified ?? 0,
      };
    })
  );
  return entries.filter((entry) => entry !== null).sort((a, b) => b.modified - a.modified);
}

async function documents(files: FilesService): Promise<FileSystemDirectoryHandle> {
  const existing = await files.get_directory(BRACKETS_DIR);
  if (existing) return existing;
  const segments = split_path(BRACKETS_DIR);
  return files.create_directory(await files.get_directory(join_path(segments.slice(0, -1))), segments.at(-1)!);
}

export async function save_new(files: FilesService, bracket: Bracket): Promise<string> {
  const handle = await files.create_file(await documents(files), file_name_for(bracket.name), { content: serialize_bracket(bracket) });
  return join_path(split_path(BRACKETS_DIR), handle.name);
}
