import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { ImagesSquare as ImagesSquareIcon } from "phosphor-svelte";
import { z } from "zod";
import { SECTION_IDS } from "./sections";

const logic = () => import("./shell");

const image_fields = new Set(["path", "paths", "before", "after"]);
const complete_images = (field: string, partial: string, context: { session: ShellSession }) =>
  image_fields.has(field) ? logic().then((m) => m.complete_images(partial, context)) : undefined;

export default define_app({
  id: "image-tools",
  name: "Image Tools",
  icon: ImagesSquareIcon,
  version: "1.0.0",
  description: "Remove a background, join, trim and split images, slice sprite sheets into frames, compare two versions, and generate test images.",
  keywords: [
    "image",
    "photo",
    "transparent",
    "colour key",
    "chroma",
    "green screen",
    "remove background",
    "cutout",
    "join",
    "merge",
    "combine",
    "stitch",
    "collage",
    "concat",
    "trim",
    "crop",
    "alpha",
    "split",
    "tiles",
    "grid",
    "instagram",
    "slice",
    "sprite",
    "sheet",
    "frames",
    "animation",
    "extract",
    "game assets",
    "pixel art",
    "test image",
    "test pattern",
    "placeholder",
    "large file",
    "compare",
    "difference",
    "before after",
    "onion skin",
  ],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: z.object({
    section: z.enum(SECTION_IDS).optional(),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
  }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: {
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
  },
  highlights: () => import("./highlights"),
  component: () => import("./image-tools.app.svelte"),
});
