import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { GAME_DEFAULTS, LEGACY_ID, leveled_game_props, Mode } from "../color-recall/modes";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "gradient-sort",
  name: "Gradient Sort",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: leveled_game_props,
  daily_rank: DailyRank.TIME,
  replaces: [{ app: LEGACY_ID, props: { mode: Mode.SORT } }],
  achievements: [
    { id: "first-sort", title: "In order", text: "Sort a gradient." },
    { id: "daily", title: "Daily gradient", text: "Sort the daily gradient." },
    { id: "hard", title: "Fine shades", text: "Sort a Hard gradient." },
    { id: "sorts-25", title: "Smooth operator", text: "Sort 25 gradients.", goal: 25 },
    { id: "no-wasted-swaps", title: "No wasted swaps", text: "Sort a gradient in the fewest swaps it takes.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./gradient-sort.app.svelte"),
});
