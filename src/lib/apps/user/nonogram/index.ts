import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export const SIZES = ["5", "10", "15", "20"] as const;

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon,
  version: "1.1.0",
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
  component: () => import("./nonogram.app.svelte"),
});
