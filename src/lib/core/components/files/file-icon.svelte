<!-- TODO: Vibed fix -->

<script lang="ts">
  import {
    FileAudio,
    FileCode,
    FileCss,
    File as FileDefault,
    FileDoc,
    FileHtml,
    FileImage,
    FileJpg,
    FileJs,
    FilePdf,
    FilePng,
    FilePpt,
    FilePy,
    FileSvg,
    FileText,
    FileTs,
    FileVideo,
    FileXls,
    FileZip,
    Folder,
  } from "phosphor-svelte";

  interface Props {
    name: string;
    kind: "file" | "directory";
    mime_type?: string;
    className?: string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  }

  let {
    name,
    kind,
    mime_type,
    className = "",
    weight = "regular",
  }: Props = $props();

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

  const typeFromMime = $derived(mime_type ? getIconFromMimeType(mime_type) : null);
  const extension = $derived(typeFromMime || getFileExtension(name));
</script>

{#if kind === "directory"}
  <Folder class={className} weight={weight} />
{:else if ["jpg", "jpeg"].includes(extension)}
  <FileJpg class={className} weight={weight} />
{:else if extension === "png"}
  <FilePng class={className} weight={weight} />
{:else if extension === "svg"}
  <FileSvg class={className} weight={weight} />
{:else if ["gif", "bmp", "webp", "ico", "tiff", "tif", "image"].includes(extension)}
  <FileImage class={className} weight={weight} />
{:else if ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v", "video"].includes(extension)}
  <FileVideo class={className} weight={weight} />
{:else if ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "audio"].includes(extension)}
  <FileAudio class={className} weight={weight} />
{:else if extension === "pdf"}
  <FilePdf class={className} weight={weight} />
{:else if ["doc", "docx"].includes(extension)}
  <FileDoc class={className} weight={weight} />
{:else if ["txt", "md", "rtf", "log", "text"].includes(extension)}
  <FileText class={className} weight={weight} />
{:else if ["xls", "xlsx", "csv"].includes(extension)}
  <FileXls class={className} weight={weight} />
{:else if ["ppt", "pptx"].includes(extension)}
  <FilePpt class={className} weight={weight} />
{:else if extension === "html" || extension === "htm"}
  <FileHtml class={className} weight={weight} />
{:else if extension === "css" || extension === "scss" || extension === "sass" || extension === "less"}
  <FileCss class={className} weight={weight} />
{:else if extension === "js" || extension === "mjs" || extension === "cjs"}
  <FileJs class={className} weight={weight} />
{:else if extension === "ts" || extension === "tsx"}
  <FileTs class={className} weight={weight} />
{:else if extension === "jsx"}
  <FileJs class={className} weight={weight} />
{:else if extension === "py"}
  <FilePy class={className} weight={weight} />
{:else if ["json", "xml", "yaml", "yml", "toml", "ini", "conf", "config", "code"].includes(extension)}
  <FileCode class={className} weight={weight} />
{:else if ["c", "cpp", "h", "hpp", "java", "cs", "php", "rb", "go", "rs", "swift", "kt"].includes(extension)}
  <FileCode class={className} weight={weight} />
{:else if ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"].includes(extension)}
  <FileCode class={className} weight={weight} />
{:else if ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(extension)}
  <FileZip class={className} weight={weight} />
{:else}
  <FileDefault class={className} weight={weight} />
{/if}
