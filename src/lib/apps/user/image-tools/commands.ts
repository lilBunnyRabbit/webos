import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";
import { PageSize } from "$lib/apps/user/pdf-tools/kinds";
import { SECTION_IDS } from "./sections";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const image_fields = new Set(["path", "paths", "before", "after"]);

const complete_images = (field: string, partial: string, context: { session: ShellSession }) =>
  image_fields.has(field) ? logic().then((m) => m.complete_images(partial, context)) : undefined;

export default {
  values: {
    "image-diff": {
      columns: ["changed", "regions", "dx", "dy", "scale"],
      cell: (stats, column) => (column === "changed" ? `${stats.changed}%` : String(stats[column] ?? "")),
      text: (stats) =>
        `${stats.changed}% changed, ${stats.regions} ${stats.regions === 1 ? "region" : "regions"}, offset ${stats.dx}, ${stats.dy}, scale ${stats.scale}`,
      open: (stats) => void logic().then((m) => m.open_compare(String(stats.before), String(stats.after))),
    },
  },
  commands: [
    define_command({
      id: "image tools",
      description: "Open Image Tools on a section, with an image",
      args: z.object({ section: z.enum(SECTION_IDS).optional(), path: arg.path().optional() }),
      positional: ["section", "path"],
      complete: complete_images,
      run: async (context) => (await logic()).tools(context),
    }),
    define_command({
      id: "image trim",
      description: "Save copies with transparent borders trimmed, next to the originals",
      args: z.object({
        paths: z.array(arg.path()).default([]).describe("Images, or the files piped in"),
        alpha: z
          .number()
          .min(0)
          .max(100)
          .default(0)
          .describe("Pixels at or below this opacity, 0–100, count as transparent"),
      }),
      positional: ["paths"],
      yields: "file",
      complete: complete_images,
      async *run(context) {
        yield* await (await logic()).trim(context);
      },
    }),
    define_command({
      id: "image split",
      description: "Cut an image into square tiles: --cols N or --rows N",
      args: z.object({
        path: arg.path(),
        cols: z.number().int().min(1).max(300).optional().describe("Tiles across; rows follow"),
        rows: z.number().int().min(1).max(300).optional().describe("Tiles down; columns follow"),
      }),
      positional: ["path"],
      short: { cols: "c", rows: "r" },
      yields: "file",
      complete: complete_images,
      async *run(context) {
        yield* await (await logic()).split(context);
      },
    }),
    define_command({
      id: "image join",
      description: "Join images, in order, into one PNG next to the first",
      args: z.object({
        paths: z.array(arg.path()).default([]).describe("Images, or the files piped in"),
        direction: z.enum(["column", "row"]).default("column").describe("column stacks, row goes side by side"),
        gap: z.number().int().min(0).default(0).describe("Pixels between images"),
        align: z.enum(["start", "center", "end"]).default("start"),
        fit: z.boolean().default(false).describe("Scale every image to the widest (column) or tallest (row)"),
        background: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .default("#ffffff")
          .describe("Background colour, #rrggbb"),
        opacity: z.number().min(0).max(100).default(0).describe("Background opacity, 0–100; 0 keeps it transparent"),
      }),
      positional: ["paths"],
      short: { direction: "d", gap: "g" },
      yields: "file",
      complete: complete_images,
      run: async (context) => (await logic()).join(context),
    }),
    define_command({
      id: "squash",
      description: "Save smaller WebP or JPEG copies of images, or of every image in a folder",
      args: z.object({
        paths: z.array(arg.path()).default([]).describe("Images or folders, or the files piped in"),
        format: z.enum(["webp", "jpeg"]).default("webp"),
        quality: z.number().int().min(1).max(100).default(80).describe("Quality, 1–100"),
        max: z.number().int().min(1).max(16_384).optional().describe("Longest side in px; smaller images stay as they are"),
        to: arg.path().optional().describe("Output folder, next to each original by default"),
        under: z.string().optional().describe("Fit each copy under this size, like 1MB; -q becomes the highest quality tried"),
        floor: z.number().int().min(1).max(100).default(50).describe("With --under: the lowest quality tried before scaling down"),
      }),
      positional: ["paths"],
      short: { format: "f", quality: "q" },
      yields: "file",
      complete: complete_images,
      async *run(context) {
        yield* await (await logic()).squash(context);
      },
    }),
    define_command({
      id: "image fit",
      description: "Save a copy under a size limit, like 1MB, next to the original: lowers the quality first, scales down only when it has to",
      args: z.object({
        path: arg.path(),
        size: z.string().describe("The limit, like 500KB or 2MB; 1 MB counts as 1,000,000 bytes"),
        format: z.enum(["keep", "jpeg", "webp", "avif", "jxl"]).default("keep").describe("AVIF and JPEG XL are slow on photos"),
        max: z.number().int().min(1).max(16_384).optional().describe("Longest side in px, before fitting"),
      }),
      positional: ["path", "size"],
      short: { format: "f" },
      yields: "file",
      complete: complete_images,
      run: async (context) => (await logic()).fit(context),
    }),
    define_command({
      id: "image convert-all",
      description: "Write an image in every format WebOS can, into a folder next to it, or one zip with --zip",
      args: z.object({
        path: arg.path(),
        zip: z.boolean().default(false).describe("One zip of every format instead of a folder"),
      }),
      positional: ["path"],
      yields: "file",
      complete: complete_images,
      async *run(context) {
        yield* await (await logic()).convert_all(context);
      },
    }),
    define_command({
      id: "imgdiff",
      description: "Compare two images: how much changed, in how many regions, and the offset and scale between them",
      args: z.object({
        before: arg.path(),
        after: arg.path(),
        tolerance: z.number().min(1).max(60).default(12).describe("How different a pixel must be to count as changed, 1–60%"),
        open: z.boolean().default(false).describe("Open both in Image Tools' Compare section instead"),
      }),
      positional: ["before", "after"],
      short: { tolerance: "t" },
      yields: "image-diff",
      complete: complete_images,
      run: async (context) => (await logic()).imgdiff(context),
    }),
    define_command({
      id: "poster",
      description: "Print an image across several sheets as one PDF next to it, with crop marks and an assembly map",
      args: z.object({
        path: arg.path(),
        across: z.number().int().min(1).max(20).default(3).describe("Sheets across; rows follow from the image"),
        paper: z.enum([PageSize.A4, PageSize.LETTER, PageSize.A3]).default(PageSize.A4),
        overlap: z.string().default("10mm").describe("What neighbouring sheets share, like 10mm, 1cm or 0.5in"),
        landscape: z.boolean().default(false).describe("Turn every sheet sideways"),
        out: arg.path().optional().describe("Output PDF or folder, next to the image by default"),
      }),
      positional: ["path"],
      short: { across: "x", out: "o" },
      yields: "file",
      complete: complete_images,
      run: async (context) => (await logic()).poster(context),
    }),
    define_command({
      id: "testimg",
      description: "Generate a test image for checking crops and alignment; --size makes one of an exact file size",
      args: z.object({
        dimensions: z.string().optional().describe("WxH, 1920x1080 by default; with --size it only sets the shape"),
        pattern: z.enum(["rings", "checker", "spectrum", "gradient", "solid", "noise"]).default("rings"),
        pixel: z.number().int().min(1).max(100_000).default(24).describe("Cell size of rings and checker, in px"),
        format: z.enum(["png", "jpeg", "webp", "svg", "bmp"]).optional().describe("From --to's extension, else png"),
        quality: z.number().min(1).max(100).default(92).describe("JPEG and WebP quality, 1–100"),
        size: z.string().optional().describe("Exact file size, like 500MB or 2GB: an uncompressed PNG or BMP"),
        to: arg.path().optional().describe("Output file or folder, /home/Pictures by default"),
        label: z.string().optional().describe("Text in the middle; {w}, {h} and {format} are filled in"),
        grid: z.boolean().default(false).describe("Grid lines at every ruler step"),
        plain: z.boolean().default(false).describe("Only the pattern: no rulers, border, corners, crosshair or label"),
      }),
      positional: ["dimensions"],
      short: { pattern: "p", format: "f", quality: "q", to: "o" },
      yields: "file",
      run: async (context) => (await logic()).testimg(context),
    }),
    define_command({
      id: "image unbg",
      description: "Save a copy with these colours made transparent, next to the original",
      args: z.object({
        path: arg.path(),
        color: z
          .array(z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i))
          .default(["#ffffff"])
          .describe("Colour to remove, #rgb or #rrggbb; repeat for more"),
      }),
      positional: ["path"],
      short: { color: "c" },
      yields: "file",
      complete: complete_images,
      run: async (context) => (await logic()).unbg(context),
    }),
  ],
} satisfies ShellContribution;
