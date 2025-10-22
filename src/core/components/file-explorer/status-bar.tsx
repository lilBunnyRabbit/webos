import { formatBytes } from "@/core/api/file";
import { useStorageEstimate } from "@/core/api/file-2/hooks";
import { useFileExplorer } from "@/core/contexts/file-explorer";
import { Loader2Icon } from "lucide-react";
import React from "react";
export function StatusBar() {
  const { items } = useFileExplorer();
  const { data: storage, isLoading: isStorageLoading } = useStorageEstimate();

  const { folderCount, fileCount } = React.useMemo(() => {
    let folderCount = 0;
    let fileCount = 0;
    for (const item of items) {
      if (item.kind === "directory") folderCount++;
      else if (item.kind === "file") fileCount++;
    }
    return { folderCount, fileCount };
  }, [items]);

  return (
    <div className="border-t border-t-foreground/20 bg-background-dark px-3 py-1.5 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>
          {items.length} items
          {(folderCount > 0 || fileCount > 0) && (
            <span>
              {" ("}
              {folderCount > 0 && (
                <>
                  {folderCount} folder{folderCount !== 1 ? "s" : ""}
                  {fileCount > 0 && ", "}
                </>
              )}
              {fileCount > 0 && (
                <>
                  {fileCount} file{fileCount !== 1 ? "s" : ""}
                </>
              )}
              {")"}
            </span>
          )}
          {isStorageLoading && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Loader2Icon className="size-3 animate-spin" />
              Processing...
            </span>
          )}
        </span>
        <span>
          Storage: {formatBytes(storage.usage)} / {formatBytes(storage.quota)} (
          {((storage.usage / storage.quota) * 100).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}
