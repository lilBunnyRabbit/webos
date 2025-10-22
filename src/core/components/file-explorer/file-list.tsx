import { useFileExplorer, useFileExplorerPath } from "@/core/contexts/file-explorer";
import { FolderIcon, Loader2Icon } from "lucide-react";
import { DirectoryItem, FileItem } from "./file-item";

export function FileList() {
  const { items, isLoading, openFile } = useFileExplorer();
  const { path, setPath } = useFileExplorerPath();

  return (
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
        <div>
          {items.map((item) => {
            return item.kind === "directory" ? (
              <DirectoryItem
                path={path}
                key={`${item.path.join("/")}/${item.handle.name}`}
                item={item}
                onOpen={() => setPath((p) => [...p, item.handle])}
              />
            ) : (
              <FileItem
                path={path}
                key={`${item.path.join("/")}/${item.handle.name}`}
                item={item}
                onOpen={(file) => openFile(file, item.handle)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
