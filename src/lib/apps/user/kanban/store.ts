import type { FilesService } from "$lib/core/api";
import { BOARDS_PATH, KanbanFileSchema, type KanbanFile } from "./data";

export async function read_boards(files: FilesService): Promise<KanbanFile | null> {
  try {
    const text = await (await files.get_file(BOARDS_PATH))?.text();
    if (!text) return null;
    const result = KanbanFileSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
