import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "brackets",
  name: "Brackets",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Tournament brackets for game night: knockout, double elimination, round robin or a race cup.",
  keywords: [
    "tournament",
    "bracket",
    "knockout",
    "elimination",
    "round robin",
    "league",
    "cup",
    "mario kart",
    "game night",
    "standings",
  ],
  associations: [".bracket"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./brackets.app.svelte"),
});
