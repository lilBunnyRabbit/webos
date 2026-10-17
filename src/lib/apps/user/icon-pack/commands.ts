import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "icons",
      description: "Zip favicons, app icons, a social card, a manifest and head tags made from an SVG or image",
      args: z.object({
        path: arg.path(),
        bg: z
          .string()
          .regex(/^(#[0-9a-f]{6}|transparent)$/i)
          .optional()
          .describe("Background, #rrggbb or transparent; Apple and maskable icons use white when transparent"),
        padding: z.string().default("0%").describe("Space around the icon on each side, like 10%"),
        to: arg.path().optional().describe("Folder for the zip, next to the image by default"),
      }),
      positional: ["path"],
      yields: "file",
      complete: (field, partial, context) => (field === "path" ? logic().then((m) => m.complete_images(partial, context)) : undefined),
      run: async (context) => (await logic()).icons(context),
    }),
  ],
} satisfies ShellContribution;
