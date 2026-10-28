import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "font-maker",
  name: "Font Maker",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  associations: [".fontmaker"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 420 } } },
  achievements: [
    { id: "first-font", title: "Typesetter", text: "Export a font." },
    { id: "alphabet", title: "A to Z", text: "Export a font with every letter from A to Z drawn." },
    { id: "variable", title: "Shape shifter", text: "Export a variable font." },
    { id: "own-hand", title: "In your own hand", text: "Use your font as the UI or code font." },
  ],
  component: () => import("./font-maker.app.svelte"),
});
