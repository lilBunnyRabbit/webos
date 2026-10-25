import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { GAME_DEFAULTS, LEGACY_ID, leveled_game_props, Mode } from "./modes";

export default define_app({
  id: "color-recall",
  name: "Color Recall",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: leveled_game_props,
  daily_rank: DailyRank.SCORE_DESC,
  // Recall was the first mode, so a Color Games link without one lands here.
  replaces: [{ app: LEGACY_ID }, { app: LEGACY_ID, props: { mode: Mode.RECALL } }],
  highlights: () => import("./highlights"),
  component: () => import("./color-recall.app.svelte"),
});
