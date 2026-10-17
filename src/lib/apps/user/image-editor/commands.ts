import { z } from "zod";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "image edit",
      description: "Open an image in Image Editor",
      args: z.object({ path: arg.path() }),
      positional: ["path"],
      run: async (context) => (await logic()).edit(context),
    }),
    define_command({
      id: "image convert",
      description: "Save a copy in another format, next to the original",
      args: z.object({
        path: arg.path(),
        format: z.enum(["png", "jpeg", "webp"]),
        quality: z.number().int().min(1).max(100).default(92).describe("JPEG and WebP quality, 1–100"),
      }),
      positional: ["path"],
      short: { format: "f", quality: "q" },
      yields: "file",
      run: async (context) => (await logic()).convert(context),
    }),
    define_command({
      id: "image resize",
      description: "Save a resized copy; with no height the aspect ratio is kept",
      args: z.object({
        path: arg.path(),
        width: z.number().int().min(1),
        height: z.number().int().min(1).optional(),
      }),
      positional: ["path", "width", "height"],
      yields: "file",
      run: async (context) => (await logic()).resize(context),
    }),
    define_command({
      id: "image rotate",
      description: "Save a rotated copy; positive degrees turn clockwise",
      args: z.object({ path: arg.path(), degrees: z.number() }),
      positional: ["path", "degrees"],
      yields: "file",
      run: async (context) => (await logic()).rotate(context),
    }),
  ],
} satisfies ShellContribution;
