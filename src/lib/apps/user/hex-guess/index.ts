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
  achievements: [
    { id: "first-win", title: "Spot on", text: "Guess a colour's hex code." },
    { id: "daily", title: "Daily hex", text: "Guess the daily colour." },
    { id: "four", title: "Sharp eye", text: "Guess the code in 4 guesses or fewer." },
    { id: "wins-25", title: "Hex fluent", text: "Guess 25 codes.", goal: 25 },
    { id: "three", title: "Hex whisperer", text: "Guess the code in 3 guesses or fewer.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./hex-guess.app.svelte"),
});
