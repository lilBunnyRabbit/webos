import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";
import { APP_ID, APP_NAME, DAY_PATTERN, Level, Mode } from "./modes";

export default define_app({
  id: APP_ID,
  name: APP_NAME,
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 520 },
    },
  },
  props: z.object({
    mode: z.enum(Mode).optional(),
    /** A day plays that day's puzzle, a number a practice one: what a challenge link carries. */
    seed: z.union([z.string().regex(DAY_PATTERN), z.number().int().nonnegative()]).optional(),
    /** Game Hub's daily contract (ADR-035): the day to play. */
    daily: z.string().regex(DAY_PATTERN).optional(),
    level: z.enum(Level).optional(),
  }),
  daily_rank: {
    [Mode.RECALL]: DailyRank.SCORE_DESC,
    [Mode.ODD]: DailyRank.SCORE_DESC,
    [Mode.SORT]: DailyRank.TIME,
    [Mode.HEX]: DailyRank.SCORE_ASC,
  },
  highlights: () => import("./highlights"),
  component: () => import("./color-games.app.svelte"),
});
