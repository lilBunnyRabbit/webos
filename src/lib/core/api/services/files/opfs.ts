import type {
  FileSystemItem,
  FileSystemFileItem,
  ListOptions,
  CreateFileOptions,
  UploadOptions,
} from "./type";

export async function get_root(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

export function default_sort(a: FileSystemItem, b: FileSystemItem): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

export async function list_directory(
  dir: FileSystemDirectoryHandle,
  options: ListOptions = {}
): Promise<FileSystemItem[]> {
  const { include_metadata = true, sort = default_sort } = options;
  const items: FileSystemItem[] = [];

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") {
      const file_handle = handle as FileSystemFileHandle;
      const item: FileSystemFileItem = { name, kind: "file", handle: file_handle };

      if (include_metadata) {
        try {
          const file = await file_handle.getFile();
          item.size = file.size;
          item.last_modified = file.lastModified;
          item.type = file.type;
        } catch (err) {
          console.warn(`Failed to get file metadata for ${name}:`, err);
        }
      }

      items.push(item);
    } else {
      items.push({ name, kind: "directory", handle: handle as FileSystemDirectoryHandle });
    }
  }

  items.sort(sort);
  return items;
}

export async function get_directory_handle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(name, options);
}

export async function get_file_handle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemFileHandle> {
  return await parent.getFileHandle(name, options);
}

export async function create_directory(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(name, { create: true });
}

export async function create_file(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: CreateFileOptions = {}
): Promise<FileSystemFileHandle> {
  const { content, overwrite = false } = options;

  if (!overwrite) {
    try {
      await parent.getFileHandle(name);
      throw new Error(`File "${name}" already exists`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        throw err;
      }
    }
  }

  const file_handle = await parent.getFileHandle(name, { create: true });

  if (content) {
    await write_file(file_handle, content);
  }

  return file_handle;
}

export async function write_file(
  handle: FileSystemFileHandle,
  content: string | Blob | BufferSource
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function read_file(handle: FileSystemFileHandle): Promise<File> {
  return await handle.getFile();
}

export async function read_file_as_text(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

export async function read_file_as_array_buffer(handle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await handle.getFile();
  return await file.arrayBuffer();
}

export async function read_file_as_blob(handle: FileSystemFileHandle): Promise<Blob> {
  const file = await handle.getFile();
  return new Blob([file], { type: file.type });
}

export async function delete_entry(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  await parent.removeEntry(name, { recursive: options.recursive ?? false });
}

export async function exists(
  parent: FileSystemDirectoryHandle,
  name: string,
  kind?: "file" | "directory"
): Promise<boolean> {
  try {
    if (kind === "file") {
      await parent.getFileHandle(name);
    } else if (kind === "directory") {
      await parent.getDirectoryHandle(name);
    } else {
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        await parent.getDirectoryHandle(name);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function copy_file(
  source: FileSystemFileHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemFileHandle> {
  const file = await source.getFile();
  const target_name = new_name ?? file.name;
  const target_handle = await target_dir.getFileHandle(target_name, { create: true });
  await write_file(target_handle, file);
  return target_handle;
}

export async function move_file(
  source_parent: FileSystemDirectoryHandle,
  source: FileSystemFileHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<void> {
  await copy_file(source, target_dir, new_name);
  const file = await source.getFile();
  await delete_entry(source_parent, file.name);
}

export async function upload_files(
  target_dir: FileSystemDirectoryHandle,
  options: UploadOptions = {}
): Promise<File[]> {
  const { multiple = true, accept } = options;

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) {
      input.accept = accept;
    }

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }

      try {
        const uploaded: File[] = [];
        for (const file of Array.from(files)) {
          const file_handle = await target_dir.getFileHandle(file.name, { create: true });
          const writable = await file_handle.createWritable();
          await writable.write(file);
          await writable.close();
          uploaded.push(file);
        }
        resolve(uploaded);
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => {
      resolve([]);
    };

    input.click();
  });
}

export async function download_file(
  handle: FileSystemFileHandle,
  file_name?: string
): Promise<void> {
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file_name ?? file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function get_storage_estimate(): Promise<{ usage: number; quota: number }> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}

export async function get_directory_size(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  const items = await list_directory(dir, { include_metadata: true });

  for (const item of items) {
    if (item.kind === "file" && item.size != null) {
      total += item.size;
    } else if (item.kind === "directory") {
      total += await get_directory_size(item.handle as FileSystemDirectoryHandle);
    }
  }

  return total;
}

export async function clear_opfs(): Promise<void> {
  const root = await get_root();
  const items = await list_directory(root, { include_metadata: false });
  for (const item of items) {
    await delete_entry(root, item.name, { recursive: true });
  }
}
