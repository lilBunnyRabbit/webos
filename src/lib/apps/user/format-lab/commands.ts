import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution, ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "convert",
      description: "Save images, or every image in a folder, as AVIF, JPEG XL, WebP, JPEG or PNG",
      args: z.object({
        paths: z.array(arg.path()).default([]).describe("Images or folders, or the files piped in"),
        to: z.enum(["avif", "jxl", "webp", "jpeg", "png"]).describe("The format to write"),
        quality: z.number().int().min(1).max(100).optional().describe("Quality, 1–100; each format has its own default"),
        out: arg.path().optional().describe("Output folder, next to each original by default"),
      }),
      positional: ["paths"],
      short: { to: "t", quality: "q", out: "o" },
      yields: "file",
      complete: (field: string, partial: string, context: { session: ShellSession }) =>
        field === "paths" ? logic().then((m) => m.complete_images(partial, context)) : undefined,
      async *run(context) {
        yield* await (await logic()).convert(context);
      },
    }),
  ],
} satisfies ShellContribution;
