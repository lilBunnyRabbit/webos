import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Bomb as BombIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "minesweeper",
  name: "Minesweeper",
  icon: BombIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Clear the board without hitting a mine.",
  keywords: ["mines", "bombs", "puzzle", "logic", "game", "classic"],
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 360 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  shell: {
    commands: [
      define_command({
        id: "minesweeper daily",
        description: "Play the daily board: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
    ],
  },
  component: () => import("./minesweeper.app.svelte"),
});
