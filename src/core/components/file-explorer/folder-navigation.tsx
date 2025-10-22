import { useCreateDirectory, useUploadFiles } from "@/core/api/file-2/hooks";
import { useFileExplorer, useFileExplorerPath, useFileExplorerView } from "@/core/contexts/file-explorer";
import { cn } from "@/core/lib/utils";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { LoaderIcon } from "lucide-react";
import React from "react";

export function FolderNavigation() {
  const { refetch, isLoading } = useFileExplorer();
  const { path, setPath } = useFileExplorerPath();
  const { search, setSearch } = useFileExplorerView();

  return (
    <div className="grid grid-cols-[min-content_3fr_1fr_min-content] grid-rows-1 items-center bg-background-dark border-b border-b-foreground/20 py-2 gap-x-2 px-2">
      <div className="flex items-center gap-1">
        <button
          className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
          title="Go back"
          disabled={!path.length}
          onClick={() => setPath((p) => p.slice(0, -1))}
        >
          <ArrowLeftIcon className="size-4" weight="bold" />
        </button>

        <button
          className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
          title="Reload"
          disabled={isLoading}
          onClick={refetch}
        >
          <ArrowClockwiseIcon className="size-4" weight="bold" />
        </button>
      </div>
      <nav className="flex items-center gap-1 px-2 text-sm bg-background h-6 rounded-sm">
        <button className="hover:underline" onClick={() => setPath([])}>
          ~
        </button>
        <span className="mx-0.5 pointer-events-none">/</span>

        {path.map((dir, idx) => (
          <React.Fragment key={dir.name}>
            <button
              className={cn(
                "hover:underline",
                idx === path.length - 1 ? "text-accent-foreground cursor-default" : "hover:bg-foreground/10"
              )}
              disabled={idx === path.length - 1}
              onClick={() => setPath(path.slice(0, idx + 1))}
            >
              {dir.name}
            </button>
            <span className="mx-0.5 pointer-events-none">/</span>
          </React.Fragment>
        ))}
      </nav>
      <div className="relative flex items-center pr-2 gap-y-1 text-sm bg-background h-6 rounded-sm">
        <input
          type="text"
          className="w-full bg-transparent text-sm placeholder:text-foreground/20 px-2 focus:outline-none h-full caret-primary"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search ? (
          <button onClick={() => setSearch("")} className="cursor-pointer">
            <XIcon className="size-4" weight="bold" />
          </button>
        ) : (
          <MagnifyingGlassIcon className="size-4" weight="bold" />
        )}
      </div>

      <div className="flex items-center gap-1">
        <NewFolderButton path={path} />

        <UploadFilesButton path={path} />
      </div>
    </div>
  );
}

const NewFolderButton = ({ path }: { path: FileSystemDirectoryHandle[] }) => {
  const { mutate: createDirectory, isPending } = useCreateDirectory(path);

  return (
    <button
      className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
      title="New folder"
      onClick={() => {
        const name = prompt("Enter folder name:");
        if (!name) return;

        createDirectory(name);
      }}
    >
      {isPending ? <LoaderIcon className="size-4 animate-spin" /> : <FolderPlusIcon className="size-4" weight="bold" />}
    </button>
  );
};

const UploadFilesButton = ({ path }: { path: FileSystemDirectoryHandle[] }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { mutate: uploadFiles, isPending } = useUploadFiles(path);

  return (
    <>
      <button
        className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
        title="Upload files"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? (
          <LoaderIcon className="size-4 animate-spin" />
        ) : (
          <UploadSimpleIcon className="size-4" weight="bold" />
        )}
      </button>

      <input
        type="file"
        className="hidden"
        multiple
        ref={inputRef}
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;

          uploadFiles(files);
        }}
      />
    </>
  );
};
