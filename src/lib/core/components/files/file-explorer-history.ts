import type { FilesService } from "$lib/core/api/services/files/type";
import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
import { join_path } from "$lib/core/api/services/files/path";

export interface HistoryStep {
  next: DirectoryHandler;
  /** The stack below `next`, without the folders found gone on the way. */
  rest: string[][];
}

/** Back and Forward keep paths, not watchers: the newest folder in `stack` that still exists is opened when it's reached. */
export async function open_latest(files: FilesService, stack: string[][]): Promise<HistoryStep | null> {
  const rest = [...stack];
  while (rest.length > 0) {
    const segments = rest.pop()!;
    const handle = await files.get_directory(join_path(segments));
    if (handle) return { next: await files.directory(segments, handle), rest };
  }
  return null;
}
