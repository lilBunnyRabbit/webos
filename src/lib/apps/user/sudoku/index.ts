import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";
import { Size } from "./size";

export default define_app({
  id: "sudoku",
  name: "Sudoku",
  icon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** The size; with `daily`, which size's daily (ADR-050). */
    mode: z.enum(Size).optional(),
  }),
  daily_rank: {
    [Size.NINE]: DailyRank.TIME,
    [Size.SIX]: DailyRank.TIME,
  },
  component: () => import("./sudoku.app.svelte"),
});
