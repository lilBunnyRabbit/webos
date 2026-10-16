import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Island as IslandIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "nurikabe",
  name: "Nurikabe",
  icon: IslandIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Shade the sea so every number becomes an island of exactly that size.",
  keywords: ["islands", "sea", "wall", "nikoli", "puzzle", "logic", "game", "brain"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
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
        id: "nurikabe daily",
        description: "Play the daily puzzle: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
    ],
  },
  component: () => import("./nurikabe.app.svelte"),
});
