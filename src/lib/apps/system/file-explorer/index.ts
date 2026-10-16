import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Folder as FolderIcon } from "phosphor-svelte";

export default define_app({
  id: "file-explorer",
  name: "File Explorer",
  icon: FolderIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Browse, open, move, copy and share your files and folders.",
  keywords: ["files", "folders", "finder", "browse", "explorer", "manager", "directory", "upload", "download"],
  // A folder path to open at; defaults to /home.
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  component: () => import("./file-explorer.app.svelte"),
});
