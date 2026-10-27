import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { GAME_DEFAULTS, LEGACY_ID, leveled_game_props, Mode } from "./modes";

export default define_app({
  id: "color-recall",
  name: "Color Recall",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: leveled_game_props,
  daily_rank: DailyRank.SCORE_DESC,
  // Recall was the first mode, so a Color Games link without one lands here.
  replaces: [{ app: LEGACY_ID }, { app: LEGACY_ID, props: { mode: Mode.RECALL } }],
  achievements: [
    { id: "first-game", title: "Total recall", text: "Finish a game." },
    { id: "daily", title: "Daily recall", text: "Finish a daily game." },
    { id: "score-40", title: "Colour memory", text: "Score 40 or more in one game." },
    { id: "hard-35", title: "Two seconds", text: "Score 35 or more on Hard." },
    { id: "games-25", title: "Colour regular", text: "Finish 25 games.", goal: 25 },
    { id: "dead-on", title: "Dead on", text: "Score a perfect 10 in a round.", secret: true },
  ],
  highlights: () => import("./highlights"),
  component: () => import("./color-recall.app.svelte"),
});
