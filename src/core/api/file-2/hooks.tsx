import { Query, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDirectory,
  getDirectory,
  getStorageEstimate,
  removeHandle,
  uploadFile,
  type FileSystemFileItem,
} from "./api";
import React from "react";

const FILE_QUERY_KEY = "file-api";
const DIRECTORY_QUERY_KEY = "directory";
const STORAGE_QUERY_KEY = "storage";

export function useStorageEstimate() {
  return useQuery({
    queryKey: [FILE_QUERY_KEY, STORAGE_QUERY_KEY],
    queryFn: () => getStorageEstimate(),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
    initialData: {
      usage: 0,
      quota: 0,
    },
  });
}

export function useDirectoryPath(path: FileSystemDirectoryHandle[], sort = true) {
  const handle = path[path.length - 1];
  const pathKey = React.useMemo(() => path.map((p) => p.name), [path]);

  return useQuery({
    queryKey: [FILE_QUERY_KEY, DIRECTORY_QUERY_KEY, pathKey],
    queryFn: async () => {
      try {
        const items = await getDirectory(handle ?? null, { path: pathKey });

        console.log(`🗃️ Fetched directory: ~/${pathKey.join("/")}`, items);

        if (sort) {
          return items.sort((a, b) => {
            if (a.kind !== b.kind) {
              return a.kind === "directory" ? -1 : 1;
            }
            return a.handle.name.localeCompare(b.handle.name);
          });
        }

        return items;
      } catch (error) {
        console.error(`🗃️ Error fetching directory: ~/${pathKey.join("/")}`, error);

        throw error;
      }
    },
    initialData: [],
  });
}

export function useFile(item: FileSystemFileItem) {
  return useQuery({
    queryKey: [FILE_QUERY_KEY, "file", item.path, item.handle.name],
    queryFn: async () => {
      try {
        const file = await item.handle.getFile();
        console.log(`🗃️ Fetched file: ~/${item.path.join("/")}/${item.handle.name}`, file);
        return file;
      } catch (error) {
        console.error(`🗃️ Error fetching file: ~/${item.path.join("/")}/${item.handle.name}`, error);
        throw error;
      }
    },
  });
}

function isPathInvalidate(path: FileSystemDirectoryHandle[]) {
  return (query: Query<unknown, Error, unknown, readonly unknown[]>) => {
    if (query.queryKey[0] === FILE_QUERY_KEY) {
      if (query.queryKey[1] === STORAGE_QUERY_KEY) {
        return true;
      }

      if (query.queryKey[1] === DIRECTORY_QUERY_KEY) {
        if (!Array.isArray(query.queryKey[2])) return false;
        if (query.queryKey[2].length !== path.length) return false;
        const isEvery = query.queryKey[2].every((key, index) => {
          return key === path[index].name;
        });

        if (isEvery) {
          console.log("🗃️ Invalidating query:", query.queryKey);
        }

        return isEvery;
      }
    }

    return false;
  };
}

export function useUploadFiles(path: FileSystemDirectoryHandle[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: FileList | File[]) => {
      for (const file of files) {
        await uploadFile(path[path.length - 1] ?? null, file);
      }
    },
    onSuccess: (_, files) => {
      console.log(`🗃️ Uploaded files to: ~/${path.join("/")}`, files);
      queryClient.invalidateQueries({
        predicate: isPathInvalidate(path),
      });
    },
    onError: (error, variables) => {
      console.error(`🗃️ Error uploading files to: ~/${path.join("/")}`, variables, error);
    },
  });
}

export function useCreateDirectory(path: FileSystemDirectoryHandle[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await createDirectory(path[path.length - 1] ?? null, name);
    },
    onSuccess: (_, name) => {
      console.log(`🗃️ Created directory: ~/${path.join("/")}/${name}`);

      queryClient.invalidateQueries({
        predicate: isPathInvalidate(path),
      });
    },
    onError: (error, variables) => {
      console.error(`🗃️ Error creating directory: ~/${path.join("/")}/${variables}`, error);
    },
  });
}

export function useRemoveHandle(path: FileSystemDirectoryHandle[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (handle: FileSystemFileHandle | FileSystemDirectoryHandle) => {
      await removeHandle(path[path.length - 1] ?? null, handle);
    },
    onSuccess: (_, handle) => {
      console.log(`🗃️ Handle removed: ~/${path.join("/")}/${handle.name}`);

      queryClient.invalidateQueries({
        predicate: isPathInvalidate(path),
      });
    },
    onError: (error, variables) => {
      console.error(`🗃️ Error removing handle: ~/${path.join("/")}/${variables.name}`, error);
    },
  });
}
