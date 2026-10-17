import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Package as PackageIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "sokoban",
  name: "Sokoban",
  icon: PackageIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Push every crate onto a goal without boxing yourself in.",
  keywords: ["boxes", "crates", "warehouse", "push", "puzzle", "logic", "game", "classic"],
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 400 },
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
        id: "sokoban daily",
        description: "Play the daily level: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
    ],
  },
  component: () => import("./sokoban.app.svelte"),
});
