import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { Sliders as SlidersIcon } from "phosphor-svelte";

const logic = () => import("./shell");

export default define_app({
  id: "image-editor",
  name: "Image Editor",
  icon: SlidersIcon,
  version: "1.0.0",
  description: "Crop, resize, rotate, flip and adjust the colours of an image.",
  keywords: ["photo", "picture", "crop", "resize", "rotate", "flip", "brightness", "contrast", "filter", "convert", "jpeg", "webp", "png"],
  category: AppCategory.MEDIA,
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 360 } } },
  shell: {
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
        args: z.object({ path: arg.path(), width: z.number().int().min(1), height: z.number().int().min(1).optional() }),
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
  },
  component: () => import("./image-editor.app.svelte"),
});
