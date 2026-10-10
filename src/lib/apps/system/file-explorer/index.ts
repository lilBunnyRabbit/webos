import { define_app } from "$lib/core/api";
import { Folder as FolderIcon } from "phosphor-svelte";

export default define_app({
  id: "file-explorer",
  name: "File Explorer",
  icon: FolderIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./file-explorer.app.svelte"),
});
