export interface PickedFile {
  /** Inside the picked folder, its own name excluded: `["sub", "a.txt"]`. */
  path: string[];
  file: File;
}

/** A folder from the device, read as a flat list so the folder picker and `webkitdirectory` give the same shape. */
export interface PickedFolder {
  name: string;
  files: PickedFile[];
  /** Every subfolder, so empty ones are kept too. */
  folders: string[][];
}

export interface FolderGroup {
  name: string;
  directory: boolean;
  files: PickedFile[];
  folders: string[][];
  size: number;
}

/** `webkitdirectory` gives files only, each with `webkitRelativePath` ("Photos/2024/a.png"); empty folders are lost. */
export function folder_from_files(files: File[]): PickedFolder | null {
  const first = files[0]?.webkitRelativePath.split("/")[0];
  if (!first) return null;
  const picked = files.map((file) => ({ path: file.webkitRelativePath.split("/").slice(1), file }));
  const folders = new Map<string, string[]>();
  for (const { path } of picked) {
    for (let depth = 1; depth < path.length; depth++) folders.set(path.slice(0, depth).join("/"), path.slice(0, depth));
  }
  return { name: first, files: picked, folders: [...folders.values()] };
}

export async function folder_from_handle(handle: FileSystemDirectoryHandle): Promise<PickedFolder> {
  const files: PickedFile[] = [];
  const folders: string[][] = [];
  async function walk(directory: FileSystemDirectoryHandle, path: string[]): Promise<void> {
    for await (const [name, entry] of directory.entries()) {
      if (entry.kind === "file") files.push({ path: [...path, name], file: await (entry as FileSystemFileHandle).getFile() });
      else {
        folders.push([...path, name]);
        await walk(entry as FileSystemDirectoryHandle, [...path, name]);
      }
    }
  }
  await walk(handle, []);
  return { name: handle.name, files, folders };
}

/** One group per top-level file or folder, in name order: the unit of one upload task. */
export function top_level_groups(folder: PickedFolder): FolderGroup[] {
  const groups = new Map<string, FolderGroup>();
  const group = (name: string, directory: boolean) => {
    const existing = groups.get(name);
    if (existing) return existing;
    const created: FolderGroup = { name, directory, files: [], folders: [], size: 0 };
    groups.set(name, created);
    return created;
  };
  for (const path of folder.folders) group(path[0], true).folders.push(path);
  for (const entry of folder.files) {
    const target = group(entry.path[0], entry.path.length > 1);
    target.files.push(entry);
    target.size += entry.file.size;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
