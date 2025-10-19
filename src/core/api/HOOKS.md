# File System API - TanStack Query Hooks

React hooks for the File System API using TanStack Query for optimal caching, loading states, and automatic refetching.

## Why Use These Hooks?

### Benefits Over Direct API Calls

| Feature | Direct API | TanStack Query Hooks |
|---------|-----------|---------------------|
| **Caching** | Manual | ✅ Automatic |
| **Loading States** | Manual state management | ✅ Built-in `isLoading`, `isPending` |
| **Error Handling** | Manual try-catch | ✅ Built-in `error`, `isError` |
| **Refetching** | Manual | ✅ Automatic on focus, reconnect |
| **Deduplication** | Multiple requests | ✅ Single request for same key |
| **Optimistic Updates** | Complex manual logic | ✅ Built-in support |
| **Invalidation** | Manual cache management | ✅ Automatic on mutations |
| **DevTools** | None | ✅ React Query DevTools |

## Installation

Already included in the project! Just import:

```typescript
import { useOPFSRoot, useDirectoryList, useCreateFile } from "@/core/api";
```

## Query Hooks (Read Operations)

### `useOPFSRoot()`

Get the OPFS root directory handle with infinite caching.

```typescript
const { data: root, isLoading, error } = useOPFSRoot();
```

**Returns:**
- `data`: `FileSystemDirectoryHandle` - Root directory handle
- `isLoading`: boolean - Loading state
- `error`: Error | null - Error if any

**Cache Strategy:**
- `staleTime: Infinity` - Never becomes stale (root handle doesn't change)

---

### `useDirectoryList(dirHandle, listOptions?, queryOptions?)`

List directory contents with automatic caching and revalidation.

```typescript
const { data: items, isLoading, refetch } = useDirectoryList(
  dirHandle,
  { includeMetadata: true }, // List options
  { staleTime: 60000 } // Query options
);
```

**Parameters:**
- `dirHandle`: `FileSystemDirectoryHandle | null` - Directory to list
- `listOptions`: `DirectoryListOptions` - Optional list configuration
- `queryOptions`: TanStack Query options

**Returns:**
- `data`: `FileSystemItem[]` - Array of files and directories
- `isLoading`: boolean
- `refetch`: () => Promise - Manual refetch function

**Cache Strategy:**
- `staleTime: 30000` (30 seconds)
- Automatically invalidated when files/folders are created/deleted

**Example:**
```typescript
function FileList({ dirHandle }: { dirHandle: FileSystemDirectoryHandle }) {
  const { data: items, isLoading } = useDirectoryList(dirHandle, {
    includeMetadata: true,
    sort: (a, b) => a.name.localeCompare(b.name)
  });

  if (isLoading) return <Loader />;

  return (
    <ul>
      {items?.map(item => (
        <li key={item.name}>
          {item.name} - {item.size && formatBytes(item.size)}
        </li>
      ))}
    </ul>
  );
}
```

---

### `useDirectorySize(dirHandle, queryOptions?)`

Calculate directory size recursively with caching.

```typescript
const { data: sizeInBytes, isLoading } = useDirectorySize(dirHandle);
```

**Cache Strategy:**
- `staleTime: 60000` (1 minute) - Expensive operation, cached longer

---

### `useFile(fileHandle, queryOptions?)`

Read file as File object with caching.

```typescript
const { data: file, isLoading } = useFile(fileHandle);
```

**Returns:** File object with name, size, type, lastModified

---

### `useFileText(fileHandle, queryOptions?)`

Read file as text with caching.

```typescript
const { data: content, isLoading } = useFileText(fileHandle);
```

**Example:**
```typescript
function TextFileViewer({ fileHandle }: { fileHandle: FileSystemFileHandle }) {
  const { data: content, isLoading, error } = useFileText(fileHandle);

  if (isLoading) return <Spinner />;
  if (error) return <div>Error: {error.message}</div>;

  return <pre>{content}</pre>;
}
```

---

### `useFileArrayBuffer(fileHandle, queryOptions?)`

Read file as ArrayBuffer with caching.

```typescript
const { data: buffer, isLoading } = useFileArrayBuffer(fileHandle);
```

---

### `useFileBlob(fileHandle, queryOptions?)`

Read file as Blob with caching.

```typescript
const { data: blob, isLoading } = useFileBlob(fileHandle);
const url = blob ? URL.createObjectURL(blob) : null;
```

---

### `useStorageEstimate(queryOptions?)`

Get storage usage with automatic refetching.

```typescript
const { data: storage } = useStorageEstimate();
// storage: { usage: number, quota: number }
```

**Cache Strategy:**
- `staleTime: 10000` (10 seconds)
- `refetchInterval: 30000` (refetch every 30 seconds)

**Example:**
```typescript
function StorageIndicator() {
  const { data: storage } = useStorageEstimate();

  if (!storage) return null;

  const percentage = (storage.usage / storage.quota) * 100;

  return (
    <div>
      <ProgressBar value={percentage} />
      <span>
        {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
      </span>
    </div>
  );
}
```

---

### `useExists(parent, name, kind?, queryOptions?)`

Check if file or directory exists.

```typescript
const { data: exists } = useExists(root, "config.json", "file");
```

---

## Mutation Hooks (Write Operations)

### `useCreateDirectory(options?)`

Create a directory with automatic cache invalidation.

```typescript
const createDir = useCreateDirectory({
  onSuccess: (newDirHandle) => {
    console.log("Directory created!");
  },
  onError: (error) => {
    alert(`Failed: ${error.message}`);
  }
});

// Use it
createDir.mutate({ parent: root, name: "my-folder" });
```

**Invalidates:**
- Parent directory list
- Storage estimate

---

### `useCreateFile(options?)`

Create a file with content.

```typescript
const createFile = useCreateFile({
  onSuccess: () => {
    console.log("File created!");
  }
});

createFile.mutate({
  parent: root,
  name: "notes.txt",
  options: { content: "Hello, World!" }
});
```

**Invalidates:**
- Parent directory list
- Storage estimate

---

### `useWriteFile(options?)`

Write content to a file with automatic cache invalidation.

```typescript
const writeFile = useWriteFile({
  onMutate: () => {
    // Show saving indicator
  },
  onSuccess: () => {
    // File content queries automatically refetch!
  }
});

writeFile.mutate({
  fileHandle,
  content: "Updated content"
});
```

**Invalidates:**
- All file read queries for that handle
- Storage estimate

**Example with Optimistic Updates:**
```typescript
function TextEditor({ fileHandle }: { fileHandle: FileSystemFileHandle }) {
  const [localContent, setLocalContent] = useState("");
  const { data: content } = useFileText(fileHandle);
  const writeFile = useWriteFile();

  useEffect(() => {
    if (content) setLocalContent(content);
  }, [content]);

  const handleSave = () => {
    writeFile.mutate({ fileHandle, content: localContent });
  };

  return (
    <>
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
      />
      <button onClick={handleSave} disabled={writeFile.isPending}>
        {writeFile.isPending ? "Saving..." : "Save"}
      </button>
    </>
  );
}
```

---

### `useDeleteEntry(options?)`

Delete file or directory with confirmation.

```typescript
const deleteEntry = useDeleteEntry({
  onSuccess: () => {
    console.log("Deleted!");
  }
});

const handleDelete = () => {
  if (!confirm("Delete file?")) return;
  
  deleteEntry.mutate({
    parent: root,
    name: "old-file.txt",
    options: { recursive: false }
  });
};
```

**Invalidates:**
- Parent directory list
- Storage estimate

---

### `useUploadFiles(options?)`

Upload files with progress tracking.

```typescript
const uploadFiles = useUploadFiles({
  onSuccess: (files) => {
    console.log(`Uploaded ${files.length} files`);
  },
  onError: (error) => {
    alert(`Upload failed: ${error.message}`);
  }
});

const handleUpload = () => {
  uploadFiles.mutate({
    targetDir: root,
    options: {
      multiple: true,
      accept: "image/*"
    }
  });
};
```

**Invalidates:**
- Target directory list
- Storage estimate

---

### `useCopyFile(options?)`

Copy file to another directory.

```typescript
const copyFile = useCopyFile();

copyFile.mutate({
  sourceHandle: fileHandle,
  targetDir: targetDirHandle,
  newName: "copy.txt" // Optional
});
```

---

### `useMoveFile(options?)`

Move file to another directory.

```typescript
const moveFile = useMoveFile();

moveFile.mutate({
  sourceParent: sourceDirHandle,
  sourceHandle: fileHandle,
  targetDir: targetDirHandle,
  newName: "moved.txt" // Optional
});
```

**Invalidates:**
- Both source and target directory lists
- Storage estimate

---

### `useDownloadFile(options?)`

Download file to user's local file system.

```typescript
const downloadFile = useDownloadFile();

downloadFile.mutate({
  fileHandle,
  fileName: "download.txt" // Optional custom name
});
```

**Note:** Doesn't invalidate cache (no OPFS changes)

---

### `useClearOPFS(options?)`

Clear all OPFS contents (use with extreme caution!).

```typescript
const clearOPFS = useClearOPFS({
  onSuccess: () => {
    console.log("All files deleted!");
  }
});

const handleClear = () => {
  if (!confirm("DELETE ALL FILES?")) return;
  clearOPFS.mutate();
};
```

**Invalidates:** All file system queries

---

## Advanced Patterns

### 1. Dependent Queries

```typescript
function FileViewer({ fileName }: { fileName: string }) {
  const { data: root } = useOPFSRoot();
  const { data: exists } = useExists(root, fileName, "file");
  
  // Only fetch file if it exists
  const { data: fileHandle } = useQuery({
    queryKey: ["file-handle", fileName],
    queryFn: () => root!.getFileHandle(fileName),
    enabled: !!root && !!exists
  });
  
  const { data: content } = useFileText(fileHandle ?? null);
  
  return <pre>{content}</pre>;
}
```

### 2. Optimistic Updates

```typescript
function QuickEdit({ fileHandle }: { fileHandle: FileSystemFileHandle }) {
  const queryClient = useQueryClient();
  const { data: content } = useFileText(fileHandle);
  
  const writeFile = useWriteFile({
    onMutate: async ({ content: newContent }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: fileQueryKeys.fileText(fileHandle) 
      });
      
      // Snapshot previous value
      const previous = queryClient.getQueryData(
        fileQueryKeys.fileText(fileHandle)
      );
      
      // Optimistically update
      queryClient.setQueryData(
        fileQueryKeys.fileText(fileHandle),
        newContent
      );
      
      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(
        fileQueryKeys.fileText(fileHandle),
        context?.previous
      );
    },
    onSettled: () => {
      // Refetch to ensure sync
      queryClient.invalidateQueries({ 
        queryKey: fileQueryKeys.fileText(fileHandle) 
      });
    }
  });
  
  return (
    <textarea
      value={content}
      onChange={(e) => writeFile.mutate({ 
        fileHandle, 
        content: e.target.value 
      })}
    />
  );
}
```

### 3. Infinite Queries (for large directories)

```typescript
// Can be extended to support pagination for very large directories
function LargeDirectoryBrowser({ dirHandle }: { dirHandle: FileSystemDirectoryHandle }) {
  const { data: items } = useDirectoryList(dirHandle, {
    includeMetadata: false // Skip metadata for performance
  });
  
  // Implement virtual scrolling for thousands of files
  return <VirtualList items={items} />;
}
```

### 4. Background Sync

```typescript
function AutoSaveEditor({ fileHandle }: { fileHandle: FileSystemFileHandle }) {
  const [content, setContent] = useState("");
  const writeFile = useWriteFile();
  
  // Auto-save every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (content) {
        writeFile.mutate({ fileHandle, content });
      }
    }, 5000);
    
    return () => clearInterval(timer);
  }, [content, fileHandle, writeFile]);
  
  return (
    <div>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      {writeFile.isPending && <span>Saving...</span>}
      {writeFile.isSuccess && <span>✓ Saved</span>}
    </div>
  );
}
```

---

## Query Keys Factory

All hooks use a centralized query key factory for consistency:

```typescript
import { fileQueryKeys } from "@/core/api";

// Access query keys
fileQueryKeys.all                           // ["file-system"]
fileQueryKeys.root()                        // ["file-system", "root"]
fileQueryKeys.directory(dirHandle)          // ["file-system", "directory", handle]
fileQueryKeys.file(fileHandle)              // ["file-system", "file", handle]
fileQueryKeys.storage()                     // ["file-system", "storage"]

// Manual invalidation
queryClient.invalidateQueries({ 
  queryKey: fileQueryKeys.directory(dirHandle) 
});
```

---

## Performance Tips

1. **Use `staleTime` appropriately**
   ```typescript
   useDirectoryList(dir, undefined, { staleTime: 60000 }); // 1 minute
   ```

2. **Disable metadata when not needed**
   ```typescript
   useDirectoryList(dir, { includeMetadata: false });
   ```

3. **Prefetch common queries**
   ```typescript
   queryClient.prefetchQuery({
     queryKey: fileQueryKeys.root(),
     queryFn: FileAPI.getOPFSRoot
   });
   ```

4. **Use `enabled` to prevent unnecessary fetches**
   ```typescript
   useFileText(fileHandle, { enabled: !!fileHandle });
   ```

---

## Migration from Direct API

**Before:**
```typescript
const [items, setItems] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  const load = async () => {
    try {
      const data = await FileAPI.listDirectory(dirHandle);
      setItems(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  load();
}, [dirHandle]);
```

**After:**
```typescript
const { data: items, isLoading, error } = useDirectoryList(dirHandle);
```

**Result:**
- ✅ 15 lines → 1 line
- ✅ Automatic caching
- ✅ Automatic refetching
- ✅ Built-in error handling

---

## React Query DevTools

Add DevTools to see all queries and their states:

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
}
```

---

## Summary

| Hook | Type | Purpose | Auto Invalidates |
|------|------|---------|------------------|
| `useOPFSRoot` | Query | Get root directory | - |
| `useDirectoryList` | Query | List directory | On create/delete |
| `useDirectorySize` | Query | Get size | On changes |
| `useFile` | Query | Read file | On write |
| `useFileText` | Query | Read as text | On write |
| `useFileArrayBuffer` | Query | Read as buffer | On write |
| `useFileBlob` | Query | Read as blob | On write |
| `useStorageEstimate` | Query | Get storage | On any mutation |
| `useExists` | Query | Check existence | On changes |
| `useCreateDirectory` | Mutation | Create dir | Parent list |
| `useCreateFile` | Mutation | Create file | Parent list |
| `useWriteFile` | Mutation | Write file | File queries |
| `useDeleteEntry` | Mutation | Delete item | Parent list |
| `useUploadFiles` | Mutation | Upload | Target dir list |
| `useCopyFile` | Mutation | Copy file | Target dir list |
| `useMoveFile` | Mutation | Move file | Both dir lists |
| `useDownloadFile` | Mutation | Download | None |
| `useClearOPFS` | Mutation | Clear all | All queries |

---

See `file.hooks.example.tsx` for complete working examples!

