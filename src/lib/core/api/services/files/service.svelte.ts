import { SvelteMap } from "svelte/reactivity";
import type { FilesService as IFilesService } from "./type";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "FilesService";

  to_string(): string {
    return `FilesService`;
  }

  private root: Promise<DirectoryHandler> | null = null;

  private cache: DirectoryHandler[] = [];

  private async get_root(): Promise<DirectoryHandler> {
    if (!this.root) {
      this.root = navigator.storage.getDirectory().then((handle) => new DirectoryHandler(this, handle, [], true));

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

  public async get_directory(
    directory_handle: FileSystemDirectoryHandle | null = null,
    path?: DirectoryHandler[]
  ): Promise<DirectoryHandler> {
    if (!directory_handle) {
      return await this.get_root();
    }

    // TODO: this works but clearly could be better - path system
    for (const value of this.cache) {
      if (await directory_handle.isSameEntry(value.instance.handle)) {
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

    const handler = new DirectoryHandler(this, directory_handle, path);
    this.cache.push(handler);
    console.log("🗃️ Cache set", this.cache.length, handler);
    return handler;
  }

  public async upload_file(handle: FileSystemDirectoryHandle | null = null, file: File) {
    const directory_handle: FileSystemDirectoryHandle = handle ?? (await this.get_root()).instance.handle;
    const file_handle = await directory_handle.getFileHandle(file.name, { create: true });
    const writable = await file_handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

export class DirectoryHandler {
  public instance: { handle: FileSystemDirectoryHandle; created_at: Date };

  constructor(
    readonly service: FilesService,
    handle: FileSystemDirectoryHandle,
    readonly path: DirectoryHandler[] = [],
    readonly is_root: boolean = false
  ) {
    this.instance = $state.raw({
      handle,
      created_at: new Date(),
    });
  }

  public get name(): string {
    return this.is_root ? "~" : this.instance.handle.name;
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
  public async values(): Promise<
    Array<
      | {
          type: "file";
          handle: FileSystemFileHandle;
        }
      | {
          type: "directory";
          handle: FileSystemDirectoryHandle;
        }
    >
  > {
    const items: Array<
      | {
          type: "file";
          handle: FileSystemFileHandle;
        }
      | {
          type: "directory";
          handle: FileSystemDirectoryHandle;
        }
    > = [];
    for await (const handle of this.instance.handle.values()) {
      if (handle.kind === "file") {
        items.push({ type: "file", handle: handle as FileSystemFileHandle });
      } else if (handle.kind === "directory") {
        items.push({ type: "directory", handle: handle as FileSystemDirectoryHandle });
      }
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

  public async remove_directory(handle: FileSystemDirectoryHandle) {
    await this.instance.handle.removeEntry(handle.name, { recursive: true });

    this.reload();
  }

  public async open_directory(handle: FileSystemDirectoryHandle): Promise<DirectoryHandler> {
    return this.service.get_directory(handle, [...this.path, this]);
  }
}
