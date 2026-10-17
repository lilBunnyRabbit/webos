import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Stack as StackIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "blocks",
  name: "Blocks",
  icon: StackIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Falling blocks: fill rows to clear them before the stack reaches the top.",
  keywords: ["game", "arcade", "classic", "falling", "blocks", "puzzle", "lines", "sprint"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 460 },
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
        id: "blocks daily",
        description: "Play the daily sprint: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
    ],
  },
  component: () => import("./blocks.app.svelte"),
});
