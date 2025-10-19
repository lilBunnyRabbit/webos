import { useState, useEffect, useCallback } from "react";
import {
  FileIcon,
  FolderIcon,
  HardDriveIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
  RefreshCwIcon,
  HomeIcon,
  ChevronRightIcon,
  Loader2Icon,
  AlertCircleIcon,
  FolderPlusIcon,
  FilePlusIcon,
  EditIcon,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { useApps } from "@/core/contexts/apps";
import {
  formatBytes,
  readFile,
  readFileAsText,
  useOPFSRoot,
  useDirectoryList,
  useStorageEstimate,
  useCreateDirectory,
  useCreateFile,
  useDeleteEntry,
  useUploadFiles,
  useDownloadFile,
  useWriteFile,
} from "@/core/api";
import type { FileSystemItem } from "@/core/api/file.types";

interface BreadcrumbItem {
  name: string;
  handle: FileSystemDirectoryHandle;
}

export default function FileExplorerApp() {
  const apps = useApps();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileSystemItem | null } | null>(null);
  const [navKey, setNavKey] = useState(0); // Force refetch on navigation

  // Queries with automatic caching and refetching
  const { data: root, isLoading: rootLoading, error: rootError } = useOPFSRoot();
  
  // Use root as currentDir initially, can be changed by navigation
  const [currentDir, setCurrentDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>(() => 
    root ? [{ name: "Root", handle: root }] : []
  );
  
  // Use root if currentDir not set
  const activeDir = currentDir || root || null;
  
  const { data: items = [], isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useDirectoryList(
    activeDir,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { includeMetadata: true, _navKey: navKey } as any // Add navKey to force unique query
  );
  const { data: storage } = useStorageEstimate();

  // Mutations with automatic cache invalidation
  const createDirectoryMutation = useCreateDirectory({
    onSuccess: () => {
      console.log("Directory created successfully");
    },
    onError: (error) => {
      console.error("Failed to create directory:", error);
    },
  });

  const createFileMutation = useCreateFile({
    onSuccess: () => {
      console.log("File created successfully");
    },
    onError: (error) => {
      console.error("Failed to create file:", error);
    },
  });

  const deleteEntryMutation = useDeleteEntry({
    onSuccess: () => {
      console.log("Item deleted successfully");
      setSelectedItem(null);
    },
    onError: (error) => {
      console.error("Failed to delete item:", error);
    },
  });

  const uploadFilesMutation = useUploadFiles({
    onSuccess: (files) => {
      console.log(`Uploaded ${files.length} files successfully`);
    },
    onError: (error) => {
      console.error("Failed to upload files:", error);
    },
  });

  const downloadFileMutation = useDownloadFile({
    onError: (error) => {
      console.error("Failed to download file:", error);
    },
  });

  const writeFileMutation = useWriteFile({
    onSuccess: () => {
      console.log("File saved successfully");
    },
    onError: (error) => {
      console.error("Failed to save file:", error);
    },
  });

  // Update breadcrumbs when root becomes available (only if empty)
  useEffect(() => {
    if (root && breadcrumbs.length === 0) {
      // Queue state update to avoid direct setState in effect
      Promise.resolve().then(() => {
        setBreadcrumbs([{ name: "Root", handle: root }]);
      });
    }
  }, [root, breadcrumbs.length]);

  // Navigate to directory
  const navigateToDirectory = useCallback(async (dirHandle: FileSystemDirectoryHandle, dirName: string) => {
    console.log(`📂 Navigating to: ${dirName}`);
    setCurrentDir(dirHandle);
    setBreadcrumbs((prev) => [...prev, { name: dirName, handle: dirHandle }]);
    setSelectedItem(null);
    setNavKey((k) => k + 1); // Force refetch
  }, []);

  // Navigate to breadcrumb
  const navigateToBreadcrumb = useCallback((index: number) => {
    const breadcrumb = breadcrumbs[index];
    if (breadcrumb) {
      console.log(`📂 Navigating to breadcrumb: ${breadcrumb.name}`);
      setCurrentDir(breadcrumb.handle);
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      setSelectedItem(null);
      setNavKey((k) => k + 1); // Force refetch
    }
  }, [breadcrumbs]);

  // Create new directory
  const createDirectory = useCallback(() => {
    if (!activeDir) return;

    const name = prompt("Enter directory name:");
    if (!name) return;

    createDirectoryMutation.mutate({ parent: activeDir, name });
  }, [activeDir, createDirectoryMutation]);

  // Create new file
  const createFile = useCallback(() => {
    if (!activeDir) return;

    const name = prompt("Enter file name:");
    if (!name) return;

    createFileMutation.mutate({ parent: activeDir, name, options: { content: "" } });
  }, [activeDir, createFileMutation]);

  // Delete item
  const deleteItem = useCallback((item: FileSystemItem) => {
    if (!activeDir) return;

    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    deleteEntryMutation.mutate({ 
      parent: activeDir, 
      name: item.name, 
      options: { recursive: item.kind === "directory" } 
    });
  }, [activeDir, deleteEntryMutation]);

  // Open file in media-preview
  const openFile = useCallback(async (item: FileSystemItem) => {
    if (item.kind !== "file") return;

    try {
      const fileHandle = item.handle as FileSystemFileHandle;
      const file = await readFile(fileHandle);
      
      // Open the file in media-preview app
      apps.open("media-preview", { file });
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [apps]);

  // Edit text file
  const editFile = useCallback(async (item: FileSystemItem) => {
    if (item.kind !== "file") return;

    try {
      const fileHandle = item.handle as FileSystemFileHandle;
      const content = await readFileAsText(fileHandle);

      const newContent = prompt(`Edit file "${item.name}":`, content);
      if (newContent === null) return; // User cancelled

      writeFileMutation.mutate({ fileHandle, content: newContent });
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }, [writeFileMutation]);

  // Download file
  const downloadFile = useCallback((item: FileSystemItem) => {
    if (item.kind !== "file") return;

    const fileHandle = item.handle as FileSystemFileHandle;
    downloadFileMutation.mutate({ fileHandle, fileName: item.name });
  }, [downloadFileMutation]);

  // Upload file
  const uploadFile = useCallback(() => {
    if (!activeDir) return;

    uploadFilesMutation.mutate({ targetDir: activeDir, options: { multiple: true } });
  }, [activeDir, uploadFilesMutation]);

  // Handle item click
  const handleItemClick = useCallback((item: FileSystemItem) => {
    setSelectedItem(item.name);
  }, []);

  // Handle item double click
  const handleItemDoubleClick = useCallback(async (item: FileSystemItem) => {
    if (item.kind === "directory") {
      await navigateToDirectory(item.handle as FileSystemDirectoryHandle, item.name);
    } else {
      await openFile(item);
    }
  }, [navigateToDirectory, openFile]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, item: FileSystemItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // Close context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Compute loading and error states
  const isLoading = rootLoading || itemsLoading;
  const error = rootError || itemsError;

  // Check if any mutation is pending
  const isMutating = 
    createDirectoryMutation.isPending || 
    createFileMutation.isPending || 
    deleteEntryMutation.isPending || 
    uploadFilesMutation.isPending ||
    downloadFileMutation.isPending ||
    writeFileMutation.isPending;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex flex-1 items-center gap-2">
          <button
            onClick={() => navigateToBreadcrumb(0)}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="Go to root"
            disabled={isMutating}
          >
            <HomeIcon className="size-4" />
          </button>

          <button
            onClick={() => refetchItems()}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="Refresh"
            disabled={isMutating}
          >
            <RefreshCwIcon className={cn("size-4", itemsLoading && "animate-spin")} />
          </button>

          <div className="mx-2 h-6 w-px bg-border" />

          <button
            onClick={createDirectory}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="New folder"
            disabled={!activeDir || isMutating}
          >
            <FolderPlusIcon className="size-4" />
          </button>

          <button
            onClick={createFile}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="New file"
            disabled={!activeDir || isMutating}
          >
            <FilePlusIcon className="size-4" />
          </button>

          <button
            onClick={uploadFile}
            className="rounded p-1 hover:bg-accent disabled:opacity-50"
            title="Upload files"
            disabled={!activeDir || isMutating}
          >
            {uploadFilesMutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
          </button>
        </div>

        <HardDriveIcon className="size-4 text-muted-foreground" />
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-3 py-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronRightIcon className="size-3 text-muted-foreground" />}
            <button
              onClick={() => navigateToBreadcrumb(index)}
              className={cn(
                "rounded px-2 py-0.5 hover:bg-accent",
                index === breadcrumbs.length - 1 && "font-medium"
              )}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Error Messages */}
      {error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}
      
      {createDirectoryMutation.error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>Failed to create directory: {createDirectoryMutation.error.message}</span>
          <button
            onClick={() => createDirectoryMutation.reset()}
            className="ml-auto rounded px-2 py-1 hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {createFileMutation.error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>Failed to create file: {createFileMutation.error.message}</span>
          <button
            onClick={() => createFileMutation.reset()}
            className="ml-auto rounded px-2 py-1 hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {deleteEntryMutation.error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>Failed to delete: {deleteEntryMutation.error.message}</span>
          <button
            onClick={() => deleteEntryMutation.reset()}
            className="ml-auto rounded px-2 py-1 hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {uploadFilesMutation.error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>Failed to upload: {uploadFilesMutation.error.message}</span>
          <button
            onClick={() => uploadFilesMutation.reset()}
            className="ml-auto rounded px-2 py-1 hover:bg-destructive/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <FolderIcon className="size-16 opacity-20" />
            <p>This folder is empty</p>
          </div>
        ) : (
          <div className="p-2">
            <div className="divide-y rounded-md border">
              {items.map((item) => {
                const Icon = item.kind === "directory" ? FolderIcon : FileIcon;
                const isSelected = selectedItem === item.name;

                return (
                  <div
                    key={item.name}
                    onClick={() => handleItemClick(item)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/50",
                      isSelected && "bg-accent",
                      isMutating && "pointer-events-none opacity-60"
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.kind === "file" && (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {item.size !== undefined ? formatBytes(item.size) : "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.lastModified ? formatDate(item.lastModified) : "-"}
                        </span>
                      </>
                    )}
                    {item.kind === "directory" && (
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {items.length} items
            {isMutating && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2Icon className="size-3 animate-spin" />
                Processing...
              </span>
            )}
          </span>
          {storage && (
            <span>
              Storage: {formatBytes(storage.usage)} / {formatBytes(storage.quota)} (
              {((storage.usage / storage.quota) * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.item && (
            <>
              {contextMenu.item.kind === "file" && (
                <>
                  <button
                    onClick={() => {
                      openFile(contextMenu.item!);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <FileIcon className="size-4" />
                    Open
                  </button>
                  <button
                    onClick={() => {
                      editFile(contextMenu.item!);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <EditIcon className="size-4" />
                    Edit as Text
                  </button>
                  <button
                    onClick={() => {
                      downloadFile(contextMenu.item!);
                      setContextMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <DownloadIcon className="size-4" />
                    Download
                  </button>
                  <div className="my-1 h-px bg-border" />
                </>
              )}
              <button
                onClick={() => {
                  deleteItem(contextMenu.item!);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2Icon className="size-4" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

