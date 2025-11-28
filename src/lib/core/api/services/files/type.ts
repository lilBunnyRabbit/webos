import type { IService } from "../../type";
import type { DirectoryHandler } from "./service.svelte";

export interface FilesService extends IService {
  get_directory(
    handle: FileSystemDirectoryHandle | null
  ): Promise<DirectoryHandler>;
  upload_file(handle: FileSystemDirectoryHandle | null, file: File): Promise<void>;
}
