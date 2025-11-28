import { SvelteMap } from "svelte/reactivity";
import type { FilesService as IFilesService } from "./type";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "FilesService";

  to_string(): string {
    return `FilesService`;
  }

  private root: Promise<FileSystemDirectoryHandle> | null = null;

  private cache = new SvelteMap<FileSystemDirectoryHandle, DirectoryHandler>();

  private async get_root(): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      this.root = navigator.storage.getDirectory();

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

    return await this.root;
  }

  public async get_directory(handle: FileSystemDirectoryHandle | null = null): Promise<DirectoryHandler> {
    const directory_handle: FileSystemDirectoryHandle = handle ?? (await this.get_root());


    // TODO: this works but clearly could be better - path system
    for (const [key, value] of this.cache.entries()) {
      if (await directory_handle.isSameEntry(key)) {
        return value;
      }
    }

    // const items: FileSystemHandle[] = [];

    // for await (const handle of directory_handle.values()) {
    //   if (handle.kind === "file") {
    //     items.push(handle);
    //   } else if (handle.kind === "directory") {
    //     items.push(handle);
    //   }
    // }

    const handler = new DirectoryHandler(directory_handle);
    this.cache.set(directory_handle, handler);
    console.log("🗃️ Cache set", this.cache.size, handler);
    return handler;
  }

  public async upload_file(handle: FileSystemDirectoryHandle | null = null, file: File) {
    const directory_handle: FileSystemDirectoryHandle = handle ?? (await this.get_root());
    const file_handle = await directory_handle.getFileHandle(file.name, { create: true });
    const writable = await file_handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

export class DirectoryHandler {
  public instance: { handle: FileSystemDirectoryHandle; created_at: Date };
  constructor(handle: FileSystemDirectoryHandle) {
    this.instance = $state.raw({
      handle,
      created_at: new Date(),
    });
  }

  // TODO: needs work
  public reload() {
    // TODO: this works but clearly could be better
    this.instance = {
      handle: this.instance.handle,
      created_at: new Date(),
    };
  }

  // Svelte doesn't support async iterators, so we need to return a promise
  public async values(): Promise<FileSystemHandle[]> {
    const items: FileSystemHandle[] = [];
    for await (const handle of this.instance.handle.values()) {
      items.push(handle);
    }
    return items;
  }

  public async create_file(file: File) {
    const file_handle = await this.instance.handle.getFileHandle(file.name, { create: true });
    const writable = await file_handle.createWritable();
    await writable.write(file);
    await writable.close();

    this.reload();
  }

  public async remove_file(handle: FileSystemFileHandle) {
    await this.instance.handle.removeEntry(handle.name, { recursive: false });

    this.reload();
  }
}
