import { define_app } from "$lib/core/api";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";

export default define_app({
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: FilePdfIcon,
  version: "1.0.0",
  categories: ["system"],
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
