import * as FileExplorer from "@/core/components/file-explorer";
import { useApps } from "@/core/contexts/apps";

export default function FileExplorerApp() {
  const apps = useApps();

  return (
    <FileExplorer.Provider openFile={(file) => apps.open("media-preview", { file })}>
      <div className="flex h-full flex-col bg-background">
        <FileExplorer.Navigation />

        <FileExplorer.List />

        <FileExplorer.StatusBar />
      </div>
    </FileExplorer.Provider>
  );
}

/*
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

  const {
    data: items = [],
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useDirectoryList(
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
  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const breadcrumb = breadcrumbs[index];
      if (breadcrumb) {
        console.log(`📂 Navigating to breadcrumb: ${breadcrumb.name}`);
        setCurrentDir(breadcrumb.handle);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
        setSelectedItem(null);
        setNavKey((k) => k + 1); // Force refetch
      }
    },
    [breadcrumbs]
  );

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
  const deleteItem = useCallback(
    (item: FileSystemItem) => {
      if (!activeDir) return;

      if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

      deleteEntryMutation.mutate({
        parent: activeDir,
        name: item.name,
        options: { recursive: item.kind === "directory" },
      });
    },
    [activeDir, deleteEntryMutation]
  );

  // Open file in media-preview
  const openFile = useCallback(
    async (item: FileSystemItem) => {
      if (item.kind !== "file") return;

      try {
        const fileHandle = item.handle as FileSystemFileHandle;
        const file = await readFile(fileHandle);

        // Open the file in media-preview app
        apps.open("media-preview", { file });
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [apps]
  );

  // Edit text file
  const editFile = useCallback(
    async (item: FileSystemItem) => {
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
    },
    [writeFileMutation]
  );

  // Download file
  const downloadFile = useCallback(
    (item: FileSystemItem) => {
      if (item.kind !== "file") return;

      const fileHandle = item.handle as FileSystemFileHandle;
      downloadFileMutation.mutate({ fileHandle, fileName: item.name });
    },
    [downloadFileMutation]
  );

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
  const handleItemDoubleClick = useCallback(
    async (item: FileSystemItem) => {
      if (item.kind === "directory") {
        await navigateToDirectory(item.handle as FileSystemDirectoryHandle, item.name);
      } else {
        await openFile(item);
      }
    },
    [navigateToDirectory, openFile]
  );

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
*/
