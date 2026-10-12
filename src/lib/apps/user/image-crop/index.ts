import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Crop as CropIcon } from "phosphor-svelte";

export default define_app({
  id: "image-crop",
  name: "Image Crop",
  icon: CropIcon,
  version: "1.0.0",
  description: "Trims transparent borders from an image.",
  keywords: ["trim", "transparent", "alpha", "image"],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 420 },
      height: { min: 320 },
    },
  },
  component: () => import("./image-crop.app.svelte"),
});
