import kernel, { type FilesService } from "$lib/core/api";
import { base_name } from "$lib/core/api/services/files/path";
import { has_drag_paths, has_os_files, read_drag_paths, read_os_entries } from "$lib/core/components/files/drag";

export interface SourceFile {
  name: string;
  path: string | null;
  file: File;
}

export async function source_at(path: string): Promise<SourceFile> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`${path} no longer exists.`);
  return { name: base_name(path), path, file };
}

export function device_source(file: File): SourceFile {
  return { name: file.name, path: null, file };
}

export function accepts_drop(event: DragEvent): boolean {
  return has_drag_paths(event) || has_os_files(event);
}

// Must run inside the drop handler, before any await: the items are only readable while the event dispatches.
export function read_drop(event: DragEvent): Promise<SourceFile[]> {
  if (has_drag_paths(event)) {
    const paths = read_drag_paths(event);
    return Promise.all(paths.map((path) => source_at(path).catch(() => null))).then((list) =>
      list.filter((item) => item !== null)
    );
  }
  return read_os_entries(event).then(async (entries) => {
    const out: SourceFile[] = [];
    for (const entry of entries) {
      if (entry instanceof File) out.push(device_source(entry));
      else if (entry.kind === "file") out.push(device_source(await (entry as FileSystemFileHandle).getFile()));
    }
    return out;
  });
}
