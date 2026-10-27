import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tunnels",
  name: "Tunnels",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 500 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  achievements: [
    { id: "first-solve", title: "Dug through", text: "Find every word in a puzzle." },
    { id: "daily", title: "Daily dig", text: "Solve a daily puzzle." },
    { id: "large", title: "Deep tunnels", text: "Solve a Large puzzle without a hint." },
    { id: "solves-25", title: "Excavator", text: "Solve 25 puzzles.", goal: 25 },
    { id: "red-herring", title: "Red herring", text: "Trace a real word that isn't one of the hidden ones.", secret: true },
  ],
  component: () => import("./tunnels.app.svelte"),
});
