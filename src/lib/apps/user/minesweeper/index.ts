import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "minesweeper",
  name: "Minesweeper",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
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
  shell: () => import("./commands"),
  achievements: [
    { id: "first-win", title: "All clear", text: "Win a game." },
    { id: "intermediate", title: "Getting serious", text: "Win on Intermediate." },
    { id: "expert", title: "Expert", text: "Win on Expert." },
    { id: "quick", title: "Quick sweep", text: "Win on Beginner in under 10 seconds." },
    { id: "wins-25", title: "Sweeper", text: "Win 25 games.", goal: 25 },
    { id: "bare-hands", title: "Bare hands", text: "Win on Intermediate or Expert without placing a flag.", secret: true },
  ],
  guide: () => import("./guide.md?raw"),
  component: () => import("./minesweeper.app.svelte"),
});
