import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hopsprite",
  name: "Hopsprite",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  associations: [".hopsprite"],
  tools: ["image/png", "image/gif", ".png", ".gif"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  achievements: [
    { id: "first-save", title: "Sprite on file", text: "Save a sprite." },
    { id: "animation", title: "It moves!", text: "Export an animation of 2 frames or more." },
    { id: "flipbook", title: "Flipbook", text: "Export an animation of 12 different frames or more." },
  ],
  component: () => import("./hopsprite.app.svelte"),
});
