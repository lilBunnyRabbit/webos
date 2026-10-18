import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Reads PDF documents with the browser's built-in viewer.",
  pitch: {
    problem: "A PDF in your files should open without downloading anything.",
    solution: "Read it in the browser's own PDF viewer, right in a window.",
  },
  keywords: ["pdf", "document", "reader", "viewer"],
  associations: ["application/pdf", ".pdf"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 400 },
      height: { min: 300 },
    },
  },
  component: () => import("./pdf-viewer.app.svelte"),
});
