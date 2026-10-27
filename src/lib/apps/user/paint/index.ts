import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "paint",
  name: "Paint",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  achievements: [
    { id: "first-save", title: "Framed", text: "Save a drawing." },
    { id: "touch-up", title: "Touch-up", text: "Change an image that's already a file and save it over itself." },
    { id: "saves-10", title: "Gallery wall", text: "Save 10 new images.", goal: 10 },
  ],
  component: () => import("./paint.app.svelte"),
});
