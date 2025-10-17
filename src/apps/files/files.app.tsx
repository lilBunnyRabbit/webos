import { useState } from "react";
import {
  FileIcon,
  FolderIcon,
  ImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FileTextIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { useApps } from "@/core/contexts/apps";
import { cn } from "@/core/lib/utils";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
}

// Static list of files in public/files directory
const FILES_LIST: FileItem[] = [
  { name: "file_example_JPG_100kB.jpg", path: "/files/file_example_JPG_100kB.jpg", type: "file" },
  { name: "file_example_MP3_700KB.mp3", path: "/files/file_example_MP3_700KB.mp3", type: "file" },
  { name: "file_example_MP4_480_1_5MG.mp4", path: "/files/file_example_MP4_480_1_5MG.mp4", type: "file" },
  { name: "file-sample_150kB.pdf", path: "/files/file-sample_150kB.pdf", type: "file" },
];

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext || "")) {
    return ImageIcon;
  }
  if (["mp4", "webm", "ogg", "mov", "avi"].includes(ext || "")) {
    return FileVideoIcon;
  }
  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(ext || "")) {
    return FileAudioIcon;
  }
  if (["pdf", "txt", "doc", "docx"].includes(ext || "")) {
    return FileTextIcon;
  }

  return FileIcon;
}

function getFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const typeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    pdf: "application/pdf",
    txt: "text/plain",
  };

  return typeMap[ext || ""] || "application/octet-stream";
}

async function fetchFileAsFile(path: string, filename: string): Promise<File> {
  const publicPath = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + "/";
  const response = await fetch(publicPath + path);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  const blob = await response.blob();
  const type = getFileType(filename);

  // Create a File object from the blob
  return new File([blob], filename, {
    type,
    lastModified: Date.now(),
  });
}

export default function FilesApp() {
  const apps = useApps();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileClick = async (fileItem: FileItem) => {
    if (fileItem.type === "directory") {
      // TODO: Handle directory navigation
      return;
    }

    setLoading(fileItem.name);
    setError(null);

    try {
      const file = await fetchFileAsFile(fileItem.path, fileItem.name);
      apps.open("media-preview", { file });
      setSelectedFile(fileItem.name);
    } catch (err) {
      console.error("Failed to open file:", err);
      setError(err instanceof Error ? err.message : "Failed to open file");
    } finally {
      setLoading(null);
    }
  };

  const handleFileDoubleClick = (fileItem: FileItem) => {
    // Double-click is already handled by the single click in this case
    handleFileClick(fileItem);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <FolderIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Files</span>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto p-2">
        {error && (
          <div className="mx-2 mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
          {FILES_LIST.map((fileItem) => {
            const Icon = fileItem.type === "directory" ? FolderIcon : getFileIcon(fileItem.name);
            const isLoading = loading === fileItem.name;
            const isSelected = selectedFile === fileItem.name;

            return (
              <button
                key={fileItem.path}
                onDoubleClick={() => handleFileDoubleClick(fileItem)}
                disabled={isLoading}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg p-3 transition-colors",
                  "hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected && "bg-accent",
                  isLoading && "cursor-wait opacity-60"
                )}
                title={fileItem.name}
              >
                <div className="relative">
                  {isLoading ? (
                    <Loader2Icon className="size-12 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon className="size-12 text-muted-foreground" />
                  )}
                </div>
                <span className="w-full truncate text-center text-xs">{fileItem.name}</span>
              </button>
            );
          })}
        </div>

        {FILES_LIST.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <FolderIcon className="size-16 opacity-20" />
            <p>No files found</p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{FILES_LIST.length} items</span>
      </div>
    </div>
  );
}
