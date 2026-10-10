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
    class?: string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  }

  let {
    name,
    kind,
    mime_type,
    class: class_name = "",
    weight = "regular",
  }: Props = $props();

  const get_file_extension = (filename: string): string => {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  };

  const get_icon_from_mime_type = (mime: string) => {
    const type = mime.toLowerCase();

    if (type.startsWith("image/")) {
      if (type === "image/jpeg" || type === "image/jpg") return "jpg";
      if (type === "image/png") return "png";
      if (type === "image/svg+xml") return "svg";
      return "image";
    }

    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";

    if (type === "application/pdf") return "pdf";
    if (
      type === "application/msword" ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      return "doc";
    if (type === "text/plain" || type === "text/markdown") return "text";

    if (
      type === "application/vnd.ms-excel" ||
      type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      type === "text/csv"
    )
      return "xls";

    if (
      type === "application/vnd.ms-powerpoint" ||
      type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
      return "ppt";

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

  const type_from_mime = $derived(mime_type ? get_icon_from_mime_type(mime_type) : null);
  const extension = $derived(type_from_mime || get_file_extension(name));
</script>

{#if kind === "directory"}
  <Folder class={class_name} {weight} />
{:else if ["jpg", "jpeg"].includes(extension)}
  <FileJpg class={class_name} {weight} />
{:else if extension === "png"}
  <FilePng class={class_name} {weight} />
{:else if extension === "svg"}
  <FileSvg class={class_name} {weight} />
{:else if ["gif", "bmp", "webp", "ico", "tiff", "tif", "image"].includes(extension)}
  <FileImage class={class_name} {weight} />
{:else if ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v", "video"].includes(extension)}
  <FileVideo class={class_name} {weight} />
{:else if ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "audio"].includes(extension)}
  <FileAudio class={class_name} {weight} />
{:else if extension === "pdf"}
  <FilePdf class={class_name} {weight} />
{:else if ["doc", "docx"].includes(extension)}
  <FileDoc class={class_name} {weight} />
{:else if ["txt", "md", "rtf", "log", "text"].includes(extension)}
  <FileText class={class_name} {weight} />
{:else if ["xls", "xlsx", "csv"].includes(extension)}
  <FileXls class={class_name} {weight} />
{:else if ["ppt", "pptx"].includes(extension)}
  <FilePpt class={class_name} {weight} />
{:else if extension === "html" || extension === "htm"}
  <FileHtml class={class_name} {weight} />
{:else if extension === "css" || extension === "scss" || extension === "sass" || extension === "less"}
  <FileCss class={class_name} {weight} />
{:else if extension === "js" || extension === "mjs" || extension === "cjs"}
  <FileJs class={class_name} {weight} />
{:else if extension === "ts" || extension === "tsx"}
  <FileTs class={class_name} {weight} />
{:else if extension === "jsx"}
  <FileJs class={class_name} {weight} />
{:else if extension === "py"}
  <FilePy class={class_name} {weight} />
{:else if ["json", "xml", "yaml", "yml", "toml", "ini", "conf", "config", "code"].includes(extension)}
  <FileCode class={class_name} {weight} />
{:else if ["c", "cpp", "h", "hpp", "java", "cs", "php", "rb", "go", "rs", "swift", "kt"].includes(extension)}
  <FileCode class={class_name} {weight} />
{:else if ["sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"].includes(extension)}
  <FileCode class={class_name} {weight} />
{:else if ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(extension)}
  <FileZip class={class_name} {weight} />
{:else}
  <FileDefault class={class_name} {weight} />
{/if}
