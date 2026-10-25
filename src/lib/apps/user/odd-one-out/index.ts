import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { GAME_DEFAULTS, game_props, LEGACY_ID, Mode } from "../color-recall/modes";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "odd-one-out",
  name: "Odd One Out",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: game_props,
  daily_rank: DailyRank.SCORE_DESC,
  replaces: [{ app: LEGACY_ID, props: { mode: Mode.ODD } }],
  highlights: () => import("./highlights"),
  component: () => import("./odd-one-out.app.svelte"),
});
