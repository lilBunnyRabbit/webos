import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "blocks",
  name: "Blocks",
  icon: AppIcon,
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
  shell: () => import("./commands"),
  component: () => import("./blocks.app.svelte"),
});
