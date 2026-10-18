import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "paint",
  name: "Paint",
  icon: AppIcon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  component: () => import("./paint.app.svelte"),
});
