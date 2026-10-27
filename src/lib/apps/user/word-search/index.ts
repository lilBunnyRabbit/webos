import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "word-search",
  name: "Word Search",
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
    { id: "first-solve", title: "Found them all", text: "Find every word in a puzzle." },
    { id: "daily", title: "Daily search", text: "Solve a daily puzzle." },
    { id: "hard", title: "Eagle eye", text: "Solve a Hard puzzle without a hint." },
    { id: "solves-25", title: "Word hunter", text: "Solve 25 puzzles.", goal: 25 },
    { id: "backwards", title: "Looking glass", text: "Find a word that reads backwards.", secret: true },
  ],
  component: () => import("./word-search.app.svelte"),
});
