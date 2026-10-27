import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { GAME_DEFAULTS, game_props, LEGACY_ID, Mode } from "../color-recall/modes";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hex-guess",
  name: "Hex Guess",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: game_props,
  daily_rank: DailyRank.SCORE_ASC,
  replaces: [{ app: LEGACY_ID, props: { mode: Mode.HEX } }],
  highlights: () => import("./highlights"),
  component: () => import("./hex-guess.app.svelte"),
});
