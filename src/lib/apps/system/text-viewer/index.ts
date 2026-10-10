import { define_app } from "$lib/core/api";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FileText as FileTextIcon } from "phosphor-svelte";

export default define_app({
  id: "text-viewer",
  name: "Text Viewer",
  icon: FileTextIcon,
  version: "1.0.0",
  categories: ["system"],
  associations: [
    "text/*",
    ".md",
    ".json",
    ".ts",
    ".js",
    ".svelte",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".log",
    ".env",
  ],
  props: FILE_PROPS,
  component: () => import("./text-viewer.app.svelte"),
});
