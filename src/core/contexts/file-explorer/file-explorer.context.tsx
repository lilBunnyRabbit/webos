import type { FileSystemItem } from "@/core/api/file-2/api";
import { useDirectoryPath } from "@/core/api/file-2/hooks";
import React from "react";

export interface FileExplorerContextProps {
  items: FileSystemItem[];
  isLoading: boolean;
  refetch: () => void;
  openFile: (file: File, handle: FileSystemFileHandle) => void;
}

export const FileExplorerContext = React.createContext<FileExplorerContextProps | null>(null);

export interface FileExplorerViewContextProps {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  // You can expand this with sort, view mode etc. as you add them later
}

export const FileExplorerViewContext = React.createContext<FileExplorerViewContextProps | null>(null);

export interface FileExplorerProviderProps {
  children: React.ReactNode;
  openFile: (file: File, handle: FileSystemFileHandle) => void;
}

export type FileExplorerPathContext = {
  path: FileSystemDirectoryHandle[];
  setPath: React.Dispatch<React.SetStateAction<FileSystemDirectoryHandle[]>>;
};

export const FileExplorerPathContext = React.createContext<FileExplorerPathContext | null>(null);

export function FileExplorerProvider({ children, openFile }: FileExplorerProviderProps) {
  const [path, setPath] = React.useState<FileSystemDirectoryHandle[]>([]);
  const [search, setSearch] = React.useState<string>("");

  const { data: items, isLoading, refetch } = useDirectoryPath(path);

  const filteredItems = React.useMemo(() => {
    if (!search) return items;

    return items.filter((item) => {
      return new RegExp(search, "i").test(item.handle.name);
    });
  }, [items, search]);

  return (
    <FileExplorerPathContext.Provider value={{ path, setPath }}>
      <FileExplorerContext.Provider value={{ items: filteredItems, isLoading, refetch, openFile }}>
        <FileExplorerViewContext.Provider value={{ search, setSearch }}>{children}</FileExplorerViewContext.Provider>
      </FileExplorerContext.Provider>
    </FileExplorerPathContext.Provider>
  );
}

export function useFileExplorer() {
  const context = React.useContext(FileExplorerContext);
  if (!context) {
    throw new Error("useFileExplorer must be used within a FileExplorerProvider");
  }
  return context;
}

export function useFileExplorerView() {
  const context = React.useContext(FileExplorerViewContext);
  if (!context) {
    throw new Error("useFileExplorerView must be used within a FileExplorerProvider");
  }
  return context;
}

export function useFileExplorerPath() {
  const context = React.useContext(FileExplorerPathContext);
  if (!context) {
    throw new Error("useFileExplorerPath must be used within a FileExplorerProvider");
  }
  return context;
}
