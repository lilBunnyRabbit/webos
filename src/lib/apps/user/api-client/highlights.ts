import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { DownloadSimple as DownloadSimpleIcon, FileText as FileTextIcon, PaperPlaneTilt as PaperPlaneTiltIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: PaperPlaneTiltIcon, title: "Send requests", text: "Method, query, headers and a JSON, text or form body. See status, timing, headers and a formatted body." },
  { icon: FileTextIcon, title: ".http files", text: "Save requests in the REST Client format and open them again, or edit them in Text Editor." },
  { icon: DownloadSimpleIcon, title: "Download to files", text: "Stream a response straight into your files with progress and Cancel." },
  { icon: TerminalIcon, title: "http and wget", text: "Send a request or download a URL from the Terminal." },
] satisfies AppHighlight[];
