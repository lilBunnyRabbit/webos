import { useEffect, useMemo, useState } from "react";
import {
  ZoomInIcon,
  ZoomOutIcon,
  RotateCwIcon,
  DownloadIcon,
  AlertCircleIcon,
  FileIcon,
  Maximize2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MediaPreviewAppProps {
  file?: File;
}

export default function MediaPreviewApp({ file }: MediaPreviewAppProps = {}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitToWindow, setFitToWindow] = useState(true);

  const mediaType = useMemo(() => {
    if (!file) return null;

    const type = file.type;
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    if (type === "application/pdf") return "pdf";

    // Fallback to extension-based detection
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext || ""))
      return "image";
    if (["mp4", "webm", "ogg", "mov", "avi"].includes(ext || "")) return "video";
    if (["mp3", "wav", "ogg", "m4a", "aac"].includes(ext || "")) return "audio";
    if (ext === "pdf") return "pdf";

    return "unknown";
  }, [file]);

  useEffect(() => {
    if (!file) return;

    try {
      const url = URL.createObjectURL(file);
      /* eslint-disable react-hooks/set-state-in-effect */
      setObjectUrl(url);
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */

      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      setError("Failed to load file");
      console.error(err);
    }
  }, [file]);

  const handleDownload = () => {
    if (!objectUrl || !file) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = file.name;
    a.click();
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleFitToWindow = () => {
    setFitToWindow(true);
    setZoom(1);
    setRotation(0);
  };

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
        <FileIcon className="size-16 opacity-20" />
        <p>No file selected</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-destructive">
        <AlertCircleIcon className="size-16" />
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
        <div className="flex-1 truncate px-2 text-sm font-medium">{file.name}</div>

        {mediaType === "image" && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.25}
              title="Zoom Out"
            >
              <ZoomOutIcon />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
              title="Zoom In"
            >
              <ZoomInIcon />
            </Button>
            <div className="mx-1 h-6 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRotate}
              title="Rotate"
            >
              <RotateCwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleFitToWindow}
              title="Fit to Window"
            >
              <Maximize2Icon />
            </Button>
          </div>
        )}

        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDownload}
          title="Download"
        >
          <DownloadIcon />
        </Button>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-auto">
        {mediaType === "image" && (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center p-4",
              !fitToWindow && "cursor-move"
            )}
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                  handleZoomIn();
                } else {
                  handleZoomOut();
                }
              }
            }}
          >
            <img
              src={objectUrl}
              alt={file.name}
              className={cn(
                "transition-transform",
                fitToWindow && "max-h-full max-w-full object-contain"
              )}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: "center",
              }}
              onClick={() => setFitToWindow(false)}
              draggable={false}
            />
          </div>
        )}

        {mediaType === "video" && (
          <div className="flex h-full items-center justify-center p-4">
            <video
              src={objectUrl}
              controls
              className="max-h-full max-w-full"
              autoPlay={false}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {mediaType === "audio" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <div className="rounded-lg bg-muted/50 p-8">
              <FileIcon className="size-24 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <audio src={objectUrl} controls className="w-full max-w-md">
              Your browser does not support the audio tag.
            </audio>
          </div>
        )}

        {mediaType === "pdf" && (
          <div className="flex h-full items-center justify-center p-4">
            <embed
              src={objectUrl}
              type="application/pdf"
              className="h-full w-full"
            />
          </div>
        )}

        {mediaType === "unknown" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
            <AlertCircleIcon className="size-16" />
            <p className="font-medium">Unsupported file type</p>
            <p className="text-sm">Cannot preview {file.type || "this file"}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="mt-4"
            >
              <DownloadIcon />
              Download File
            </Button>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>
            Type: {file.type || "Unknown"}
          </span>
          <span>
            Size: {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
          {file.lastModified && (
            <span>
              Modified: {new Date(file.lastModified).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}