import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "brackets",
  name: "Brackets",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  associations: [".bracket"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  achievements: [
    { id: "champion", title: "Champion crowned", text: "Play a tournament through to its winner." },
    { id: "double", title: "Second chances", text: "Play a double elimination bracket through to its winner." },
    { id: "cup", title: "Chequered flag", text: "Finish every race of a race cup." },
    { id: "big-field", title: "Big field", text: "Play a tournament of 16 players or more through to its winner." },
  ],
  component: () => import("./brackets.app.svelte"),
});
