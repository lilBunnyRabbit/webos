import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export const SIZES = ["5", "10", "15", "20"] as const;

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon: AppIcon,
  version: "1.1.0",
  category: AppCategory.GAMES,
  description: "Fill the grid from the number clues to reveal a picture, in black and white or colour. Draw your own.",
  pitch: {
    problem: "You want a puzzle that ends in a picture.",
    solution: "Fill the grid from the number clues to reveal it, or draw your own.",
  },
  keywords: ["picross", "griddlers", "paint by numbers", "puzzle", "logic", "colour", "editor", "game", "pixel art"],
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
  component: () => import("./nonogram.app.svelte"),
});
