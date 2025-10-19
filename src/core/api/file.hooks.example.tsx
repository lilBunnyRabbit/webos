/**
 * Examples of using TanStack Query hooks for File System API
 */

import { useOPFSRoot, useDirectoryList, useCreateFile, useWriteFile, useStorageEstimate } from "./file.hooks";
import { formatBytes } from "./file";

// ============================================================================
// Example 1: Basic File Browser Component
// ============================================================================

export function FileBrowser() {
  // Get root directory with automatic caching
  const { data: root, isLoading: rootLoading } = useOPFSRoot();
  
  // List directory contents (automatically cached and refetched when needed)
  const { data: items, isLoading: itemsLoading, error } = useDirectoryList(root);
  
  // Get storage info with automatic updates
  const { data: storage } = useStorageEstimate();

  if (rootLoading || itemsLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Files ({items?.length || 0})</h2>
      {storage && (
        <p>
          Storage: {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
        </p>
      )}
      <ul>
        {items?.map((item) => (
          <li key={item.name}>
            {item.kind === "directory" ? "📁" : "📄"} {item.name}
            {item.size && ` (${formatBytes(item.size)})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Example 2: Create File with Mutation
// ============================================================================

export function CreateFileButton() {
  const { data: root } = useOPFSRoot();
  const createFile = useCreateFile({
    onSuccess: (fileHandle) => {
      console.log("File created:", fileHandle);
      // Directory list will automatically refetch!
    },
    onError: (error) => {
      console.error("Failed to create file:", error);
    },
  });

  const handleCreate = () => {
    if (!root) return;
    
    const name = prompt("Enter file name:");
    if (!name) return;

    createFile.mutate({
      parent: root,
      name,
      options: { content: "Hello, World!" },
    });
  };

  return (
    <button onClick={handleCreate} disabled={createFile.isPending}>
      {createFile.isPending ? "Creating..." : "Create File"}
    </button>
  );
}

// ============================================================================
// Example 3: Edit File with Optimistic Updates
// ============================================================================

export function FileEditor({ fileHandle }: { fileHandle: FileSystemFileHandle }) {
  const { data: content, isLoading } = useFileText(fileHandle);
  const writeFile = useWriteFile({
    onMutate: async ({ content: newContent }) => {
      // Optimistic update - show new content immediately
      console.log("Saving:", newContent);
    },
    onSuccess: () => {
      console.log("File saved!");
      // File content query will automatically refetch
    },
  });

  const handleSave = (newContent: string) => {
    writeFile.mutate({ fileHandle, content: newContent });
  };

  if (isLoading) return <div>Loading file...</div>;

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => handleSave(e.target.value)}
        disabled={writeFile.isPending}
      />
      {writeFile.isPending && <span>Saving...</span>}
      {writeFile.isError && <span>Error saving!</span>}
    </div>
  );
}

// ============================================================================
// Example 4: Upload with Progress
// ============================================================================

export function FileUploader() {
  const { data: root } = useOPFSRoot();
  const uploadFiles = useUploadFiles({
    onSuccess: (files) => {
      console.log(`Uploaded ${files.length} files`);
      // Directory list automatically refetches!
    },
  });

  const handleUpload = async () => {
    if (!root) return;

    uploadFiles.mutate({
      targetDir: root,
      options: { multiple: true, accept: "image/*" },
    });
  };

  return (
    <button onClick={handleUpload} disabled={uploadFiles.isPending}>
      {uploadFiles.isPending ? "Uploading..." : "Upload Images"}
    </button>
  );
}

// ============================================================================
// Example 5: Delete with Confirmation
// ============================================================================

export function DeleteFileButton({
  parent,
  fileName,
}: {
  parent: FileSystemDirectoryHandle;
  fileName: string;
}) {
  const deleteEntry = useDeleteEntry({
    onSuccess: () => {
      console.log("File deleted");
      // Parent directory list automatically refetches!
    },
  });

  const handleDelete = () => {
    if (!confirm(`Delete ${fileName}?`)) return;

    deleteEntry.mutate({
      parent,
      name: fileName,
      options: { recursive: false },
    });
  };

  return (
    <button onClick={handleDelete} disabled={deleteEntry.isPending}>
      {deleteEntry.isPending ? "Deleting..." : "Delete"}
    </button>
  );
}

// ============================================================================
// Example 6: Using Query Options for Advanced Control
// ============================================================================

export function AdvancedFileBrowser() {
  const { data: root } = useOPFSRoot();
  
  // Custom stale time and refetch options
  const { data: items, refetch } = useDirectoryList(
    root,
    { includeMetadata: true }, // List options
    {
      staleTime: 60000, // Consider data fresh for 1 minute
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      retry: 3, // Retry failed requests 3 times
    }
  );

  return (
    <div>
      <button onClick={() => refetch()}>Refresh</button>
      <ul>
        {items?.map((item) => (
          <li key={item.name}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Example 7: Dependent Queries
// ============================================================================

export function FileDetails({ fileName }: { fileName: string }) {
  const { data: root } = useOPFSRoot();
  
  // First, check if file exists
  const { data: exists } = useExists(root, fileName, "file");
  
  // Only get file handle if it exists
  const { data: fileHandle } = useFileText(
    exists && root ? root.getFileHandle(fileName) : null
  );

  if (!exists) return <div>File not found</div>;
  return <div>File exists!</div>;
}

// ============================================================================
// Example 8: Parallel Queries
// ============================================================================

export function DashboardStats() {
  // All queries run in parallel
  const { data: root } = useOPFSRoot();
  const { data: items } = useDirectoryList(root);
  const { data: storage } = useStorageEstimate();
  
  const fileCount = items?.filter(i => i.kind === "file").length || 0;
  const dirCount = items?.filter(i => i.kind === "directory").length || 0;

  return (
    <div>
      <p>Files: {fileCount}</p>
      <p>Folders: {dirCount}</p>
      {storage && (
        <p>
          Storage: {((storage.usage / storage.quota) * 100).toFixed(1)}% used
        </p>
      )}
    </div>
  );
}

