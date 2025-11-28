import type { AppManifest } from "$lib/core/api";
import { FolderIcon } from "@lucide/svelte";

export default {
  id: "file-explorer",
  name: "File Explorer",
  icon: FolderIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./file-explorer.app.svelte").then((m) => m.default),
} satisfies AppManifest;
