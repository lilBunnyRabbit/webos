import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "funky",
  name: "Funky DSL",
  icon: AppIcon,
  version: "1.0.0",
  description: "Write SimplePlanes Funky Trees as code, simulate it, and copy setters and part inputs.",
  keywords: ["simpleplanes", "funky trees", "autopilot", "pid", "craft"],
  category: AppCategory.DEVELOPER,
  associations: [".fdsl"],
  tools: [".xml"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./funky.app.svelte"),
});
