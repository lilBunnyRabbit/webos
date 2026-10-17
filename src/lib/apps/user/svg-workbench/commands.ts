import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const complete_svgs = (field: string, partial: string, context: { session: ShellSession }) =>
  field === "path" ? logic().then((m) => m.complete_svgs(partial, context)) : undefined;

export default {
  commands: [
    define_command({
      id: "svg optimize",
      description: "Optimise an SVG with SVGO into name.min.svg next to it, or into -o",
      args: z.object({
        path: arg.path(),
        out: arg.path().optional().describe("Output file, replaced if it exists, or a folder"),
        precision: z.number().int().min(0).max(8).default(3).describe("Decimals kept in numbers, 0–8"),
      }),
      positional: ["path"],
      short: { out: "o", precision: "p" },
      yields: "file",
      complete: complete_svgs,
      run: async (context) => (await logic()).optimize(context),
    }),
    define_command({
      id: "svg png",
      description: "Save a PNG of an SVG next to it, with the longest side --size px",
      args: z.object({
        path: arg.path(),
        size: z.number().int().min(1).max(8192).default(512).describe("Longest side in px"),
      }),
      positional: ["path"],
      short: { size: "s" },
      yields: "file",
      complete: complete_svgs,
      run: async (context) => (await logic()).png(context),
    }),
    define_command({
      id: "svg component",
      description: "Turn an SVG into a Svelte component with size and color props",
      args: z.object({
        path: arg.path(),
        out: arg.path().optional().describe("Output file, replaced if it exists, or a folder"),
        size: z.number().int().min(1).max(1024).default(24).describe("Default size in px"),
        colors: z.boolean().default(false).describe("Keep the SVG's colours; a one-colour SVG follows color otherwise"),
      }),
      positional: ["path"],
      short: { out: "o", size: "s" },
      yields: "file",
      complete: complete_svgs,
      run: async (context) => (await logic()).component(context),
    }),
  ],
} satisfies ShellContribution;
