import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";
import { GIF_FPS, GIF_WIDTH, QUALITIES, Quality } from "./kinds";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const clip = {
  path: arg.path(),
  from: z.string().optional().describe("Start, in seconds or m:ss"),
  to: z.string().optional().describe("End, in seconds or m:ss"),
  out: arg.path().optional().describe("Output file or folder"),
};

const shared = {
  positional: ["path"] as ["path"],
  short: { out: "o" },
  yields: "file" as const,
  complete: (field: string, partial: string, context: { session: ShellSession }) =>
    field === "path" ? logic().then((m) => m.complete_videos(partial, context)) : undefined,
};

export default {
  commands: [
    define_command({
      ...shared,
      id: "video trim",
      description: "Save part of a video as a WebM clip next to it, in about the part's length",
      args: z.object({
        ...clip,
        quality: z.enum(QUALITIES).default(Quality.MEDIUM),
        mute: z.boolean().default(false),
      }),
      short: { out: "o", quality: "q" },
      run: async (context) => (await logic()).trim(context),
    }),
    define_command({
      ...shared,
      id: "video gif",
      description: "Save part of a video as a looping GIF next to it",
      args: z.object({
        ...clip,
        fps: z.number().int().min(GIF_FPS.MIN).max(GIF_FPS.MAX).default(GIF_FPS.DEFAULT),
        width: z.number().int().min(GIF_WIDTH.MIN).max(GIF_WIDTH.MAX).default(GIF_WIDTH.DEFAULT),
        plain: z.boolean().default(false).describe("No dithering: smaller, with bands"),
      }),
      short: { out: "o", width: "w" },
      run: async (context) => (await logic()).gif(context),
    }),
    define_command({
      ...shared,
      id: "video audio",
      description: "Save a video's sound as Opus in WebM next to it",
      args: z.object(clip),
      run: async (context) => (await logic()).audio(context),
    }),
  ],
} satisfies ShellContribution;
