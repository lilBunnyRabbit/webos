import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { Checkerboard as CheckerboardIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");
const SIZES = ["5", "10", "15", "20"] as const;

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon: CheckerboardIcon,
  version: "1.1.0",
  category: AppCategory.GAMES,
  description: "Fill the grid from the number clues to reveal a picture, in black and white or colour. Draw your own.",
  keywords: ["picross", "griddlers", "puzzle", "logic", "colour", "editor"],
  associations: [".nonogram"],
  props: z.object({
    path: z.string().optional(),
    daily: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  shell: {
    commands: [
      define_command({
        id: "nonogram new",
        description: "A new puzzle, black and white unless --colour (your last size by default)",
        args: z.object({
          size: z.enum(SIZES).optional().describe("Cells per side"),
          colour: z.boolean().default(false).describe("A colour puzzle"),
        }),
        run: async (context) => (await logic()).new_puzzle(context),
      }),
      define_command({
        id: "nonogram daily",
        description: "Play the daily puzzle: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
      define_command({
        id: "nonogram edit",
        description: "Draw a puzzle: a new one, or edit a .nonogram file",
        args: z.object({ path: arg.path().optional() }),
        positional: ["path"],
        run: async (context) => (await logic()).edit(context),
      }),
      define_command({
        id: "nonogram check",
        description: "Whether a .nonogram file has exactly one answer",
        args: z.object({ path: arg.path() }),
        positional: ["path"],
        run: async (context) => (await logic()).check(context),
      }),
    ],
  },
  component: () => import("./nonogram.app.svelte"),
});
