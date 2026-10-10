// Chrome ships FileSystemFileHandle.move() for OPFS, but TypeScript's DOM lib doesn't declare it yet.
interface FileSystemFileHandle {
  move(destination: FileSystemDirectoryHandle, name?: string): Promise<void>;
}
