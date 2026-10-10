import { define_app } from "$lib/core/api";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FileImage as FileImageIcon } from "phosphor-svelte";

export default define_app({
  id: "media-preview",
  name: "Media Preview",
  icon: FileImageIcon,
  version: "1.0.0",
  categories: ["system"],
  associations: ["image/*", "video/*", "audio/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 400 },
      height: { min: 300 },
    },
  },
  component: () => import("./media-preview.app.svelte"),
});
