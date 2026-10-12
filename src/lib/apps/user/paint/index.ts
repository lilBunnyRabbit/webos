import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { PaintBrush as PaintBrushIcon } from "phosphor-svelte";

export default define_app({
  id: "paint",
  name: "Paint",
  icon: PaintBrushIcon,
  version: "1.0.0",
  description: "Draw and edit images with brushes, shapes and fill.",
  keywords: ["draw", "drawing", "canvas", "brush", "pencil", "image", "png"],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  component: () => import("./paint.app.svelte"),
});
