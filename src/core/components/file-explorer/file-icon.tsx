import {
  FileAudioIcon,
  FileCodeIcon,
  FileCssIcon,
  FileIcon as FileDefaultIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileImageIcon,
  FileJpgIcon,
  FileJsIcon,
  FilePdfIcon,
  FilePngIcon,
  FilePptIcon,
  FilePyIcon,
  FileSvgIcon,
  FileTextIcon,
  FileTsIcon,
  FileVideoIcon,
  FileXlsIcon,
  FileZipIcon,
  FolderIcon,
} from "@phosphor-icons/react";

interface FileIconComponentProps {
  name: string;
  kind: "file" | "directory";
  mimeType?: string;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
};

const getIconFromMimeType = (mimeType: string) => {
  const type = mimeType.toLowerCase();

  // Images
  if (type.startsWith("image/")) {
    if (type === "image/jpeg" || type === "image/jpg") return "jpg";
    if (type === "image/png") return "png";
    if (type === "image/svg+xml") return "svg";
    return "image";
  }

  // Videos
  if (type.startsWith("video/")) return "video";

  // Audio
  if (type.startsWith("audio/")) return "audio";

  // Documents
  if (type === "application/pdf") return "pdf";
  if (
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "doc";
  if (type === "text/plain" || type === "text/markdown") return "text";

  // Spreadsheets
  if (
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "text/csv"
  )
    return "xls";

  // Presentations
  if (
    type === "application/vnd.ms-powerpoint" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  )
    return "ppt";

  // Code files
  if (type === "text/html") return "html";
  if (type === "text/css") return "css";
  if (type === "application/javascript" || type === "text/javascript") return "js";
  if (type === "application/typescript" || type === "text/typescript") return "ts";
  if (type === "text/x-python" || type === "application/x-python-code") return "py";
  if (
    type === "application/json" ||
    type === "application/xml" ||
    type === "text/xml" ||
    type === "application/yaml" ||
    type === "text/yaml"
  )
    return "code";

  // Archives
  if (type === "application/zip" || type === "application/x-zip-compressed") return "zip";
  if (
    type === "application/x-rar-compressed" ||
    type === "application/x-7z-compressed" ||
    type === "application/x-tar" ||
    type === "application/gzip"
  )
    return "zip";

  return null;
};

export function FileIcon({ name, kind, mimeType, className, weight = "regular" }: FileIconComponentProps) {
  if (kind === "directory") {
    return <FolderIcon className={className} weight={weight} />;
  }

  // Try MIME type first if available
  const typeFromMime = mimeType ? getIconFromMimeType(mimeType) : null;
  const extension = typeFromMime || getFileExtension(name);

  // Images
  if (["jpg", "jpeg"].includes(extension)) return <FileJpgIcon className={className} weight={weight} />;
  if (extension === "png") return <FilePngIcon className={className} weight={weight} />;
  if (extension === "svg") return <FileSvgIcon className={className} weight={weight} />;
  if (["gif", "bmp", "webp", "ico", "tiff", "tif", "image"].includes(extension))
    return <FileImageIcon className={className} weight={weight} />;

  // Videos
  if (["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v", "video"].includes(extension))
    return <FileVideoIcon className={className} weight={weight} />;

  // Audio
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "audio"].includes(extension))
    return <FileAudioIcon className={className} weight={weight} />;

  // Documents
  if (extension === "pdf") return <FilePdfIcon className={className} weight={weight} />;
  if (["doc", "docx"].includes(extension)) return <FileDocIcon className={className} weight={weight} />;
  if (["txt", "md", "rtf", "log", "text"].includes(extension))
    return <FileTextIcon className={className} weight={weight} />;

  // Spreadsheets
  if (["xls", "xlsx", "csv"].includes(extension)) return <FileXlsIcon className={className} weight={weight} />;

  // Presentations
  if (["ppt", "pptx"].includes(extension)) return <FilePptIcon className={className} weight={weight} />;

  // Code files
  if (extension === "html" || extension === "htm") return <FileHtmlIcon className={className} weight={weight} />;
  if (extension === "css" || extension === "scss" || extension === "sass" || extension === "less")
    return <FileCssIcon className={className} weight={weight} />;
  if (extension === "js" || extension === "mjs" || extension === "cjs")
    return <FileJsIcon className={className} weight={weight} />;
  if (extension === "ts" || extension === "tsx") return <FileTsIcon className={className} weight={weight} />;
  if (extension === "jsx") return <FileJsIcon className={className} weight={weight} />;
  if (extension === "py") return <FilePyIcon className={className} weight={weight} />;
  if (["json", "xml", "yaml", "yml", "toml", "ini", "conf", "config", "code"].includes(extension))
    return <FileCodeIcon className={className} weight={weight} />;
  if (["c", "cpp", "h", "hpp", "java", "cs", "php", "rb", "go", "rs", "swift", "kt"].includes(extension))
    return <FileCodeIcon className={className} weight={weight} />;
  if (["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"].includes(extension))
    return <FileCodeIcon className={className} weight={weight} />;

  // Archives
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(extension))
    return <FileZipIcon className={className} weight={weight} />;

  // Default
  return <FileDefaultIcon className={className} weight={weight} />;
}
