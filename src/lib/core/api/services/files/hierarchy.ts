import { available_name, list_directory, move_directory, move_file } from "./opfs";
import { split_path } from "./path";

/** Unix-lite layout of OPFS (ADR-021). */
export const PATHS = {
  home: "/home",
  desktop: "/home/Desktop",
  documents: "/home/Documents",
  downloads: "/home/Downloads",
  etc: "/etc",
  var: "/var",
  tmp: "/tmp",
} as const;

/** Top-level folders owned by the OS rather than the user. */
export const SYSTEM_DIRECTORIES: readonly string[] = [PATHS.etc, PATHS.var, PATHS.tmp];

const ROOT_DIRECTORIES = ["home", "etc", "var", "tmp"];

/** Written once the old flat root has been moved into /home, so the migration never runs twice. */
const MARKER = "hierarchy.json";
const HIERARCHY_VERSION = 1;

export function is_system_path(path: string): boolean {
  return SYSTEM_DIRECTORIES.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

async function ensure_directory(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const segment of split_path(path)) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  return dir;
}

async function has_marker(etc: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await etc.getFileHandle(MARKER);
    return true;
  } catch {
    return false;
  }
}

/** Moves everything the user kept at the root into /home. Resumes on the next boot if interrupted. */
async function migrate_root(root: FileSystemDirectoryHandle, home: FileSystemDirectoryHandle): Promise<void> {
  for (const item of await list_directory(root, { include_metadata: false })) {
    if (item.kind === "directory" && ROOT_DIRECTORIES.includes(item.name)) continue;

    const name = await available_name(home, item.name);
    if (item.kind === "file") {
      await move_file(root, item.handle, home, name);
    } else {
      await move_directory(root, item.handle, home, name);
    }
  }
}

async function empty_directory(dir: FileSystemDirectoryHandle): Promise<void> {
  for (const item of await list_directory(dir, { include_metadata: false })) {
    await dir.removeEntry(item.name, { recursive: true });
  }
}

/** Creates the layout, migrates a pre-hierarchy root once, and empties /tmp. Runs in FilesService.init(). */
export async function ensure_hierarchy(root: FileSystemDirectoryHandle): Promise<void> {
  const home = await ensure_directory(root, PATHS.home);
  const etc = await ensure_directory(root, PATHS.etc);
  await ensure_directory(root, PATHS.var);
  const tmp = await ensure_directory(root, PATHS.tmp);

  if (!(await has_marker(etc))) {
    await migrate_root(root, home);
    const marker = await etc.getFileHandle(MARKER, { create: true });
    const writable = await marker.createWritable();
    await writable.write(JSON.stringify({ version: HIERARCHY_VERSION }));
    await writable.close();
  }

  // Created after the migration, so a user's own Documents folder becomes /home/Documents instead of "Documents (1)".
  await ensure_directory(root, PATHS.desktop);
  await ensure_directory(root, PATHS.documents);
  await ensure_directory(root, PATHS.downloads);

  await empty_directory(tmp);
}
