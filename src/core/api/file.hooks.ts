/**
 * TanStack Query hooks for File System API
 * Provides caching, loading states, and automatic invalidation
 */

import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import * as FileAPI from "./file";
import type {
  FileSystemItem,
  StorageEstimate,
  DirectoryListOptions,
  CreateFileOptions,
  DeleteEntryOptions,
  UploadFilesOptions,
} from "./file.types";

// ============================================================================
// Query Keys Factory
// ============================================================================

export const fileQueryKeys = {
  all: ["file-system"] as const,
  root: () => [...fileQueryKeys.all, "root"] as const,
  directory: (handle: FileSystemDirectoryHandle) => [...fileQueryKeys.all, "directory", handle] as const,
  directorySize: (handle: FileSystemDirectoryHandle) => [...fileQueryKeys.all, "directory-size", handle] as const,
  file: (handle: FileSystemFileHandle) => [...fileQueryKeys.all, "file", handle] as const,
  fileText: (handle: FileSystemFileHandle) => [...fileQueryKeys.all, "file-text", handle] as const,
  fileBlob: (handle: FileSystemFileHandle) => [...fileQueryKeys.all, "file-blob", handle] as const,
  fileBuffer: (handle: FileSystemFileHandle) => [...fileQueryKeys.all, "file-buffer", handle] as const,
  storage: () => [...fileQueryKeys.all, "storage"] as const,
  exists: (parent: FileSystemDirectoryHandle, name: string, kind?: "file" | "directory") =>
    [...fileQueryKeys.all, "exists", parent, name, kind] as const,
};

// ============================================================================
// Query Hooks (Read Operations)
// ============================================================================

/**
 * Get the OPFS root directory handle
 */
export function useOPFSRoot(options?: Omit<UseQueryOptions<FileSystemDirectoryHandle>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: fileQueryKeys.root(),
    queryFn: () => FileAPI.getOPFSRoot(),
    staleTime: Infinity, // Root handle never changes
    ...options,
  });
}

/**
 * List directory contents with automatic caching
 */
export function useDirectoryList(
  dirHandle: FileSystemDirectoryHandle | null | undefined,
  listOptions?: DirectoryListOptions,
  queryOptions?: Omit<UseQueryOptions<FileSystemItem[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: dirHandle ? [...fileQueryKeys.directory(dirHandle), listOptions] : [],
    queryFn: () => {
      if (!dirHandle) throw new Error("Directory handle is required");
      return FileAPI.listDirectory(dirHandle, listOptions);
    },
    enabled: !!dirHandle,
    staleTime: 30000, // 30 seconds
    ...queryOptions,
  });
}

/**
 * Get directory size (recursive)
 */
export function useDirectorySize(
  dirHandle: FileSystemDirectoryHandle | null | undefined,
  options?: Omit<UseQueryOptions<number>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: dirHandle ? fileQueryKeys.directorySize(dirHandle) : [],
    queryFn: () => {
      if (!dirHandle) throw new Error("Directory handle is required");
      return FileAPI.getDirectorySize(dirHandle);
    },
    enabled: !!dirHandle,
    staleTime: 60000, // 1 minute
    ...options,
  });
}

/**
 * Read a file as File object
 */
export function useFile(
  fileHandle: FileSystemFileHandle | null | undefined,
  options?: Omit<UseQueryOptions<File>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: fileHandle ? fileQueryKeys.file(fileHandle) : [],
    queryFn: () => {
      if (!fileHandle) throw new Error("File handle is required");
      return FileAPI.readFile(fileHandle);
    },
    enabled: !!fileHandle,
    staleTime: 60000, // 1 minute
    ...options,
  });
}

/**
 * Read a file as text with caching
 */
export function useFileText(
  fileHandle: FileSystemFileHandle | null | undefined,
  options?: Omit<UseQueryOptions<string>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: fileHandle ? fileQueryKeys.fileText(fileHandle) : [],
    queryFn: () => {
      if (!fileHandle) throw new Error("File handle is required");
      return FileAPI.readFileAsText(fileHandle);
    },
    enabled: !!fileHandle,
    staleTime: 60000, // 1 minute
    ...options,
  });
}

/**
 * Read a file as ArrayBuffer
 */
export function useFileArrayBuffer(
  fileHandle: FileSystemFileHandle | null | undefined,
  options?: Omit<UseQueryOptions<ArrayBuffer>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: fileHandle ? fileQueryKeys.fileBuffer(fileHandle) : [],
    queryFn: () => {
      if (!fileHandle) throw new Error("File handle is required");
      return FileAPI.readFileAsArrayBuffer(fileHandle);
    },
    enabled: !!fileHandle,
    staleTime: 60000, // 1 minute
    ...options,
  });
}

/**
 * Read a file as Blob
 */
export function useFileBlob(
  fileHandle: FileSystemFileHandle | null | undefined,
  options?: Omit<UseQueryOptions<Blob>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: fileHandle ? fileQueryKeys.fileBlob(fileHandle) : [],
    queryFn: () => {
      if (!fileHandle) throw new Error("File handle is required");
      return FileAPI.readFileAsBlob(fileHandle);
    },
    enabled: !!fileHandle,
    staleTime: 60000, // 1 minute
    ...options,
  });
}

/**
 * Get storage estimate with automatic refetching
 */
export function useStorageEstimate(options?: Omit<UseQueryOptions<StorageEstimate>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: fileQueryKeys.storage(),
    queryFn: () => FileAPI.getStorageEstimate(),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
    ...options,
  });
}

/**
 * Check if a file or directory exists
 */
export function useExists(
  parent: FileSystemDirectoryHandle | null | undefined,
  name: string,
  kind?: "file" | "directory",
  options?: Omit<UseQueryOptions<boolean>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: parent ? fileQueryKeys.exists(parent, name, kind) : [],
    queryFn: () => {
      if (!parent) throw new Error("Parent directory handle is required");
      return FileAPI.exists(parent, name, kind);
    },
    enabled: !!parent && !!name,
    staleTime: 30000, // 30 seconds
    ...options,
  });
}

// ============================================================================
// Mutation Hooks (Write Operations)
// ============================================================================

/**
 * Create a new directory
 */
export function useCreateDirectory(
  options?: UseMutationOptions<
    FileSystemDirectoryHandle,
    Error,
    { parent: FileSystemDirectoryHandle; name: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ parent, name }) => FileAPI.createDirectory(parent, name),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (not just specific handle)
      console.log("🔄 Invalidating all directory queries after createDirectory");
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Create a new file
 */
export function useCreateFile(
  options?: UseMutationOptions<
    FileSystemFileHandle,
    Error,
    { parent: FileSystemDirectoryHandle; name: string; options?: CreateFileOptions }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ parent, name, options: createOptions }) =>
      FileAPI.createFile(parent, name, createOptions),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (not just specific handle)
      console.log("🔄 Invalidating all directory queries after createFile");
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Write content to a file
 */
export function useWriteFile(
  options?: UseMutationOptions<
    void,
    Error,
    { fileHandle: FileSystemFileHandle; content: string | Blob | BufferSource }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fileHandle, content }) => FileAPI.writeFile(fileHandle, content),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate all file queries for this handle
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.file(variables.fileHandle) });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.fileText(variables.fileHandle) });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.fileBlob(variables.fileHandle) });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.fileBuffer(variables.fileHandle) });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Delete a file or directory
 */
export function useDeleteEntry(
  options?: UseMutationOptions<
    void,
    Error,
    { parent: FileSystemDirectoryHandle; name: string; options?: DeleteEntryOptions }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ parent, name, options: deleteOptions }) =>
      FileAPI.deleteEntry(parent, name, deleteOptions),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (not just specific handle)
      console.log("🔄 Invalidating all directory queries after deleteEntry");
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Upload files from local file system
 */
export function useUploadFiles(
  options?: UseMutationOptions<
    File[],
    Error,
    { targetDir: FileSystemDirectoryHandle; options?: UploadFilesOptions }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetDir, options: uploadOptions }) => FileAPI.uploadFiles(targetDir, uploadOptions),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (not just specific handle)
      console.log(`🔄 Invalidating all directory queries after uploading ${data.length} files`);
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Copy a file to another directory
 */
export function useCopyFile(
  options?: UseMutationOptions<
    FileSystemFileHandle,
    Error,
    { sourceHandle: FileSystemFileHandle; targetDir: FileSystemDirectoryHandle; newName?: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceHandle, targetDir, newName }) =>
      FileAPI.copyFile(sourceHandle, targetDir, newName),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (not just specific handle)
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Move a file to another directory
 */
export function useMoveFile(
  options?: UseMutationOptions<
    FileSystemFileHandle,
    Error,
    {
      sourceParent: FileSystemDirectoryHandle;
      sourceHandle: FileSystemFileHandle;
      targetDir: FileSystemDirectoryHandle;
      newName?: string;
    }
  >
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceParent, sourceHandle, targetDir, newName }) =>
      FileAPI.moveFile(sourceParent, sourceHandle, targetDir, newName),
    ...options,
    onSuccess: (data, variables, context) => {
      // Invalidate ALL directory listings (both source and target)
      queryClient.invalidateQueries({ queryKey: [...fileQueryKeys.all, "directory"] });
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.storage() });
      
      // Call user's onSuccess if provided
      if (options?.onSuccess) {
        // @ts-expect-error - TanStack Query type mismatch
        options.onSuccess(data, variables, context);
      }
    },
  });
}

/**
 * Download a file to the user's local file system
 * Note: This doesn't modify OPFS, so no cache invalidation needed
 */
export function useDownloadFile(
  options?: UseMutationOptions<void, Error, { fileHandle: FileSystemFileHandle; fileName?: string }>
) {
  return useMutation({
    mutationFn: ({ fileHandle, fileName }) => FileAPI.downloadFile(fileHandle, fileName),
    ...options,
  });
}

/**
 * Clear all OPFS contents (use with caution!)
 */
export function useClearOPFS(options?: UseMutationOptions<void, Error, void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => FileAPI.clearOPFS(),
    onSuccess: () => {
      // Invalidate all file system queries
      queryClient.invalidateQueries({ queryKey: fileQueryKeys.all });
    },
    ...options,
  });
}

