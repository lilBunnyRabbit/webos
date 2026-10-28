import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tape-sketch",
  name: "Tape Sketch",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  associations: [".tapesketch"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 480 } } },
  achievements: [
    { id: "first-save", title: "On paper", text: "Save a sketch." },
    { id: "every-edge", title: "Every edge", text: "Save a sketch with every edge measured." },
    { id: "square", title: "Square and true", text: "Save a room measured all the way round whose lengths add up." },
  ],
  component: () => import("./tape-sketch.app.svelte"),
});
