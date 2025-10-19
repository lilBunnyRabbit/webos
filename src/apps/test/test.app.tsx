import { useState } from "react";
import {
  UploadIcon,
  FolderPlusIcon,
  FilePlusIcon,
  Trash2Icon,
  RefreshCwIcon,
  Loader2Icon,
  FileIcon,
  FolderIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from "lucide-react";
import {
  useOPFSRoot,
  useDirectoryList,
  useStorageEstimate,
  useCreateDirectory,
  useCreateFile,
  useUploadFiles,
  useDeleteEntry,
  formatBytes,
} from "@/core/api";

interface TestAppProps {
  random?: number;
}

export default function TestApp(props: TestAppProps = {}) {
  const [testDir, setTestDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [navKey, setNavKey] = useState(0);

  // Queries
  const { data: root, isLoading: rootLoading } = useOPFSRoot();
  const { data: items = [], isLoading: itemsLoading, refetch } = useDirectoryList(
    testDir || root || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { includeMetadata: true, _navKey: navKey } as any
  );
  const { data: storage } = useStorageEstimate();

  // Mutations
  const createDir = useCreateDirectory({
    onSuccess: () => {
      console.log("✅ Directory created - File Explorer should auto-update!");
    },
  });

  const createFile = useCreateFile({
    onSuccess: () => {
      console.log("✅ File created - File Explorer should auto-update!");
    },
  });

  const uploadFiles = useUploadFiles({
    onSuccess: (files) => {
      console.log(`✅ Uploaded ${files.length} files - File Explorer should auto-update!`);
    },
  });

  const deleteEntry = useDeleteEntry({
    onSuccess: () => {
      console.log("✅ Item deleted - File Explorer should auto-update!");
    },
  });

  // Create test directory
  const handleCreateTestDir = async () => {
    if (!root) return;
    
    try {
      createDir.mutate(
        { parent: root, name: "test-folder" },
        {
          onSuccess: async (newDir) => {
            setTestDir(newDir);
            setNavKey((k) => k + 1);
          },
        }
      );
    } catch (err) {
      console.error("Failed to create test directory:", err);
    }
  };

  // Go back to root
  const handleGoToRoot = () => {
    setTestDir(null);
    setNavKey((k) => k + 1);
  };

  const currentDir = testDir || root;

  if (rootLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background p-4">
      <div className="mb-4 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-blue-700 dark:text-blue-300">
          <CheckCircleIcon className="size-5" />
          OPFS Cache Sync Test
        </h2>
        <p className="text-sm text-muted-foreground">
          Actions performed here will automatically update in the File Explorer app (and vice versa).
          Open both apps side-by-side to see real-time synchronization!
        </p>
      </div>

      {/* Current Location */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <FolderIcon className="size-4" />
        <span>Current: {testDir ? "test-folder" : "Root"}</span>
        {testDir && (
          <button
            onClick={handleGoToRoot}
            className="ml-2 rounded bg-accent px-2 py-1 text-xs hover:bg-accent/80"
          >
            Back to Root
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (!currentDir) return;
            const name = prompt("Enter directory name:", "new-folder");
            if (name) createDir.mutate({ parent: currentDir, name });
          }}
          disabled={!currentDir || createDir.isPending}
          className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FolderPlusIcon className="size-4" />
          Create Folder
        </button>

        <button
          onClick={() => {
            if (!currentDir) return;
            const name = prompt("Enter file name:", "test.txt");
            if (name) {
              createFile.mutate({
                parent: currentDir,
                name,
                options: { content: `Test file created at ${new Date().toISOString()}` },
              });
            }
          }}
          disabled={!currentDir || createFile.isPending}
          className="flex items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
        >
          <FilePlusIcon className="size-4" />
          Create File
        </button>

        <button
          onClick={() => {
            if (!currentDir) return;
            uploadFiles.mutate({ targetDir: currentDir, options: { multiple: true } });
          }}
          disabled={!currentDir || uploadFiles.isPending}
          className="flex items-center gap-2 rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {uploadFiles.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <UploadIcon className="size-4" />
          )}
          Upload Files
        </button>

        {!testDir && (
          <button
            onClick={handleCreateTestDir}
            disabled={createDir.isPending}
            className="flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <FolderPlusIcon className="size-4" />
            Create Test Folder
          </button>
        )}

        <button
          onClick={() => refetch()}
          disabled={itemsLoading}
          className="ml-auto flex items-center gap-2 rounded bg-gray-600 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-4 ${itemsLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Errors */}
      {createDir.error && (
        <div className="mb-3 flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          <span>{createDir.error.message}</span>
          <button onClick={() => createDir.reset()} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {createFile.error && (
        <div className="mb-3 flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          <span>{createFile.error.message}</span>
          <button onClick={() => createFile.reset()} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {uploadFiles.error && (
        <div className="mb-3 flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          <span>{uploadFiles.error.message}</span>
          <button onClick={() => uploadFiles.reset()} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {deleteEntry.error && (
        <div className="mb-3 flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          <span>{deleteEntry.error.message}</span>
          <button onClick={() => deleteEntry.reset()} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-auto rounded-lg border">
        {itemsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <FolderIcon className="size-12 opacity-20" />
            <p className="text-sm">No files or folders</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const Icon = item.kind === "directory" ? FolderIcon : FileIcon;
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">{item.name}</span>
                  {item.size !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(item.size)}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      if (!currentDir) return;
                      if (confirm(`Delete "${item.name}"?`)) {
                        deleteEntry.mutate({
                          parent: currentDir,
                          name: item.name,
                          options: { recursive: item.kind === "directory" },
                        });
                      }
                    }}
                    disabled={deleteEntry.isPending}
                    className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {items.length} items
          {(createDir.isPending ||
            createFile.isPending ||
            uploadFiles.isPending ||
            deleteEntry.isPending) && (
            <span className="ml-2">
              <Loader2Icon className="inline size-3 animate-spin" /> Processing...
            </span>
          )}
        </div>
        {storage && (
          <div>
            Storage: {formatBytes(storage.usage)} / {formatBytes(storage.quota)} (
            {((storage.usage / storage.quota) * 100).toFixed(1)}%)
          </div>
        )}
      </div>

      {/* Props Info */}
      <div className="mt-4 rounded border border-dashed p-2 text-xs text-muted-foreground">
        <div>TestApp Props: random={props.random || 0}</div>
      </div>
    </div>
  );
}
