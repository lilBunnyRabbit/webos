import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";
import { APP_ID, APP_NAME, DAY_PATTERN } from "./names";

export default define_app({
  id: APP_ID,
  name: APP_NAME,
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 520 } } },
  props: z.object({
    /** A day plays that day's run, a number a practice one: what a challenge link carries. */
    seed: z.union([z.string().regex(DAY_PATTERN), z.number().int().nonnegative()]).optional(),
    /** Game Hub's daily contract (ADR-035): the day to play. */
    daily: z.string().regex(DAY_PATTERN).optional(),
    /** A practice run's models: `mixed`, a tier, or one model's id. */
    pool: z.string().max(40).optional(),
  }),
  daily_rank: DailyRank.SCORE_DESC,
  highlights: () => import("./highlights"),
  component: () => import("./colour-atlas.app.svelte"),
});
