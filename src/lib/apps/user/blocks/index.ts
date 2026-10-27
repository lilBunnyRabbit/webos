import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "blocks",
  name: "Blocks",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
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
  achievements: [
    { id: "four-lines", title: "Four at once", text: "Clear four lines with one piece." },
    { id: "level-10", title: "Picking up speed", text: "Reach level 10 in Marathon.", goal: 10 },
    { id: "sprint", title: "Sprinter", text: "Clear 40 lines in Sprint." },
    { id: "daily", title: "Daily sprint", text: "Finish a daily sprint." },
    { id: "lines-500", title: "Line cutter", text: "Clear 500 lines in Marathon in all.", goal: 500 },
    { id: "sprint-90", title: "Blur", text: "Finish Sprint in under 90 seconds.", secret: true },
  ],
  shell: () => import("./commands"),
  component: () => import("./blocks.app.svelte"),
});
