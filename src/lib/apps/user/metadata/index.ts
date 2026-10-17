import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { format_bytes } from "$lib/core/utils";
import { FileMagnifyingGlass as FileMagnifyingGlassIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

const complete_files = (field: string, partial: string, context: { session: ShellSession }) =>
  field === "paths" ? logic().then((m) => m.complete_files(partial, context)) : undefined;
const paths = z.array(arg.path()).default([]);

export default define_app({
  id: "metadata",
  name: "Metadata",
  icon: FileMagnifyingGlassIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Shows what a photo or PDF says about itself: camera, date, location, software. Strips it from images without re-encoding.",
  keywords: ["metadata", "exif", "xmp", "gps", "location", "camera", "privacy", "strip", "remove", "clean", "photo", "pdf", "properties", "info"],
  tools: ["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp", "application/pdf", ".pdf"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  shell: {
    values: {
      meta: {
        columns: ["name", "format", "camera", "date", "gps", "size"],
        cell: (value, column) => (column === "size" ? format_bytes(Number(value.size)) : String(value[column] ?? "—")),
        text: (value) => [value.name, value.format, value.camera, value.date, value.gps].filter(Boolean).join("  "),
        open: (value) => void logic().then((m) => m.open(String(value.path))),
      },
    },
    commands: [
      define_command({
        id: "meta",
        description: "What images and PDFs say about themselves: camera, date, location; click one to open it in Metadata",
        args: z.object({ paths: paths.describe("JPEG, PNG, WebP or PDF files, or the files piped in") }),
        positional: ["paths"],
        yields: "meta",
        complete: complete_files,
        async *run(context) {
          yield* (await logic()).meta(context);
        },
      }),
      define_command({
        id: "meta strip",
        description: "Save copies without metadata next to the originals, pixels untouched",
        args: z.object({
          paths: paths.describe("JPEG, PNG or WebP images, or the files piped in"),
          keep_orientation: z.boolean().default(false).describe("Keep the EXIF orientation so turned photos stay upright"),
        }),
        positional: ["paths"],
        yields: "file",
        complete: complete_files,
        run: async (context) => (await logic()).strip(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./metadata.app.svelte"),
});
