import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Rows as RowsIcon } from "phosphor-svelte";

export default define_app({
  id: "image-concat",
  name: "Image Concat",
  icon: RowsIcon,
  version: "1.0.0",
  description: "Joins several images into one, side by side or stacked.",
  keywords: ["join", "merge", "combine", "stitch", "image"],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 440 },
      height: { min: 380 },
    },
  },
  component: () => import("./image-concat.app.svelte"),
});
