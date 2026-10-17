import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Sliders as SlidersIcon } from "phosphor-svelte";

export default define_app({
  id: "image-editor",
  name: "Image Editor",
  icon: SlidersIcon,
  version: "1.0.0",
  description: "Crop, resize, rotate, flip and adjust the colours of an image.",
  keywords: [
    "photo",
    "picture",
    "image",
    "edit",
    "crop",
    "resize",
    "rotate",
    "flip",
    "brightness",
    "contrast",
    "filter",
    "convert",
    "jpeg",
    "webp",
    "png",
  ],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  component: () => import("./image-editor.app.svelte"),
});
