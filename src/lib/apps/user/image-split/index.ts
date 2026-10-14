import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { SquareSplitHorizontal as SquareSplitHorizontalIcon } from "phosphor-svelte";

export default define_app({
  id: "image-split",
  name: "Image Split",
  icon: SquareSplitHorizontalIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Split an image into square tiles, for grid layouts like Instagram",
  keywords: ["image", "photo", "split", "tiles", "grid", "instagram", "slice"],
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 420 },
      height: { min: 300 },
    },
  },
  component: () => import("./image-split.app.svelte"),
});
