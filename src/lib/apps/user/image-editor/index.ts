import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "image-editor",
  name: "Image Editor",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  component: () => import("./image-editor.app.svelte"),
});
