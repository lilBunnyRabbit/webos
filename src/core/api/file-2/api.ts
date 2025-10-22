let opfsRoot: Promise<FileSystemDirectoryHandle> | null = null;

export async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsRoot) {
    opfsRoot = navigator.storage.getDirectory();

    try {
      const persisted = await navigator.storage.persist();
      if (!persisted) {
        console.warn("🗃️ Failed to persist OPFS root");
      } else {
        console.log("🗃️ OPFS root persisted");
      }
    } catch (error) {
      console.error("🗃️ Failed to persist OPFS root", error);
    }
  }

  return await opfsRoot;
}

export function resetRoot(): void {
  opfsRoot = null;
}

export type FileSystemItemBase = {
  path: string[];
};

export interface FileSystemFileItem extends FileSystemItemBase {
  kind: "file";
  handle: FileSystemFileHandle;
}

export interface FileSystemDirectoryItem extends FileSystemItemBase {
  kind: "directory";
  handle: FileSystemDirectoryHandle;
}

export type FileSystemItem = FileSystemFileItem | FileSystemDirectoryItem;

export async function getDirectory(
  handle: FileSystemDirectoryHandle | null = null,
  base: FileSystemItemBase
): Promise<FileSystemItem[]> {
  const directoryHandle: FileSystemDirectoryHandle = handle ?? (await getRoot());
  const items: FileSystemItem[] = [];

  for await (const handle of directoryHandle.values()) {
    if (handle.kind === "file") {
      items.push({
        ...base,
        kind: "file",
        handle,
      });
    } else if (handle.kind === "directory") {
      items.push({
        ...base,
        kind: "directory",
        handle,
      });
    }
  }

  return items;
}

export async function uploadFile(handle: FileSystemDirectoryHandle | null = null, file: File) {
  const directoryHandle: FileSystemDirectoryHandle = handle ?? (await getRoot());
  const fileHandle = await directoryHandle.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function createDirectory(handle: FileSystemDirectoryHandle | null = null, name: string) {
  const directoryHandle: FileSystemDirectoryHandle = handle ?? (await getRoot());
  return await directoryHandle.getDirectoryHandle(name, { create: true });
}

export async function removeHandle(
  parentHandle: FileSystemDirectoryHandle | null = null,
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
) {
  const directoryHandle: FileSystemDirectoryHandle = parentHandle ?? (await getRoot());
  await directoryHandle.removeEntry(handle.name, { recursive: handle.kind === "directory" });
}

export async function getStorageEstimate(): Promise<Required<StorageEstimate>> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}