import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "format-lab",
  name: "Format Lab",
  icon: AppIcon,
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  // A tool, not an association: double-clicking an AVIF or a JPEG XL still views it in Media Preview.
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./format-lab.app.svelte"),
});
