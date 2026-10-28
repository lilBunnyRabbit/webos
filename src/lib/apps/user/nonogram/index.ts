import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export const SIZES = ["5", "10", "15", "20"] as const;

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  associations: [".nonogram"],
  props: z.object({
    path: z.string().optional(),
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** With `size` or `mode`: a new puzzle, asking first when one is in progress. */
    size: z.enum(SIZES).optional(),
    mode: z.enum(["bw", "color"]).optional(),
    edit: z.boolean().optional(),
  }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 400 },
    },
  },
  shell: () => import("./commands"),
  achievements: [
    { id: "first-solve", title: "Picture this", text: "Solve a puzzle." },
    { id: "daily", title: "Daily picture", text: "Solve a daily puzzle." },
    { id: "big", title: "Big picture", text: "Solve a 20×20 puzzle." },
    { id: "made", title: "Pixel pusher", text: "Save a puzzle you made in the editor." },
    { id: "solves-25", title: "Gallery", text: "Solve 25 puzzles.", goal: 25 },
    { id: "masterpiece", title: "Masterpiece", text: "Solve a 20×20 colour puzzle without a hint.", secret: true },
  ],
  guide: () => import("./guide.md?raw"),
  component: () => import("./nonogram.app.svelte"),
});
