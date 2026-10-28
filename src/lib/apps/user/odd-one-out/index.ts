import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { GAME_DEFAULTS, game_props, LEGACY_ID, Mode } from "../color-recall/modes";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "odd-one-out",
  name: "Odd One Out",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: GAME_DEFAULTS,
  props: game_props,
  daily_rank: DailyRank.SCORE_DESC,
  replaces: [{ app: LEGACY_ID, props: { mode: Mode.ODD } }],
  achievements: [
    { id: "first-run", title: "Odd spotter", text: "Finish a run." },
    { id: "daily", title: "Daily odd", text: "Finish a daily run." },
    { id: "score-20", title: "Keen eye", text: "Spot 20 in one run.", goal: 20 },
    { id: "spotted-500", title: "Seen it all", text: "Spot 500 in all.", goal: 500 },
    { id: "flawless", title: "Flawless", text: "Spot 15 or more in one run without a miss.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./odd-one-out.app.svelte"),
});
