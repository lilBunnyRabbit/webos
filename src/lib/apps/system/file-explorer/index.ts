import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "file-explorer",
  name: "File Explorer",
  icon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  // A folder path to open at; defaults to /home.
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  component: () => import("./file-explorer.app.svelte"),
});
