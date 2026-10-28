import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "four-walls",
  name: "Four Walls",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 420 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  daily_rank: DailyRank.SCORE_DESC,
  achievements: [
    { id: "four-lines", title: "Four at once", text: "Clear four lines with one piece." },
    { id: "every-wall", title: "All four walls", text: "Clear a line against every wall in one game." },
    { id: "level-10", title: "Picking up speed", text: "Reach level 10.", goal: 10 },
    { id: "lines-50", title: "Half a hundred", text: "Clear 50 lines in one game.", goal: 50 },
    { id: "daily", title: "Daily walls", text: "Finish a daily game." },
    { id: "two-walls", title: "Corner shot", text: "Clear lines against two walls with one piece.", secret: true },
  ],
  shell: () => import("./commands"),
  component: () => import("./four-walls.app.svelte"),
});
