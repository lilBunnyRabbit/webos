// Chrome ships these, but TypeScript's DOM lib doesn't declare them yet.
interface FileSystemFileHandle {
  move(destination: FileSystemDirectoryHandle, name?: string): Promise<void>;
}

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}
