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
  highlights: () => import("./highlights"),
  component: () => import("./gradient-sort.app.svelte"),
});
