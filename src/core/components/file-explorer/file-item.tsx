import { formatBytes } from "@/core/api";
import type { FileSystemDirectoryItem, FileSystemFileItem } from "@/core/api/file-2/api";
import { useFile, useRemoveHandle } from "@/core/api/file-2/hooks";
import { ChevronRightIcon } from "lucide-react";
import { FileIcon } from "./file-icon";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, ContextMenuItem } from "@/core/ui/context-menu";
import { WarningIcon } from "@phosphor-icons/react";
import { cn } from "@/core/lib/utils";

interface FileItemProps {
  path: FileSystemDirectoryHandle[];
  item: FileSystemFileItem;
  onOpen?: (file: File) => void;
}

export function FileItem({ path, item, onOpen }: FileItemProps) {
  const { mutate: removeFile, isPending } = useRemoveHandle(path);
  const { data: file, isLoading } = useFile(item);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          disabled={!file || isLoading || isPending}
          onDoubleClick={file && onOpen ? () => onOpen(file) : undefined}
          // onClick={() => handleItemClick(item)}
          // onDoubleClick={() => handleItemDoubleClick(item)}
          // onContextMenu={(e) => handleContextMenu(e, item)}
          className={cn(
            "flex cursor-pointer items-center justify-start gap-3 px-4 py-2 transition-colors hover:bg-foreground/10 focus:bg-foreground/10 w-full disabled:hover:bg-transparent disabled:cursor-default",
            isPending && "bg-accent/20"
          )}
          onKeyUp={(e) => {
            if (e.key === "Delete") {
              removeFile(item.handle);
            }
          }}
        >
          <FileIcon
            name={item.handle.name}
            kind="file"
            mimeType={file?.type}
            className="size-5 shrink-0 text-primary"
          />
          <span className="flex-1 truncate text-left">{item.handle.name}</span>

          {file ? (
            <>
              <span className="text-xs text-muted-foreground font-mono">
                {file.size !== undefined ? formatBytes(file.size) : "-"}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}
              </span>
            </>
          ) : (
            <WarningIcon className="size-4 text-accent" />
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Profile</ContextMenuItem>
        <ContextMenuItem>Billing</ContextMenuItem>
        <ContextMenuItem>Team</ContextMenuItem>
        <ContextMenuItem>Subscription</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface DirectoryItemProps {
  path: FileSystemDirectoryHandle[];
  item: FileSystemDirectoryItem;
  onOpen?: () => void;
}

export function DirectoryItem({ path, item, onOpen }: DirectoryItemProps) {
  const { mutate: removeHandle, isPending } = useRemoveHandle(path);
  return (
    <button
      disabled={isPending}
      onDoubleClick={onOpen}
      onKeyUp={(e) => {
        if (e.key === "Delete") {
          removeHandle(item.handle);
        }
      }}
      // onClick={() => handleItemClick(item)}
      // onDoubleClick={() => handleItemDoubleClick(item)}
      // onContextMenu={(e) => handleContextMenu(e, item)}
      className={cn(
        "flex cursor-pointer items-center justify-start gap-3 px-4 py-2 transition-colors hover:bg-foreground/10 focus:bg-foreground/10 w-full disabled:hover:bg-transparent disabled:cursor-default",
        isPending && "bg-accent/20"
      )}
    >
      <FileIcon name={item.handle.name} kind="directory" className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-left">{item.handle.name}</span>

      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </button>
  );
}
