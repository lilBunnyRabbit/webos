import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { format_bytes } from "$lib/core/utils";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const complete_files = (field: string, partial: string, context: { session: ShellSession }) =>
  field === "paths" ? logic().then((m) => m.complete_files(partial, context)) : undefined;

const paths = z.array(arg.path()).default([]);

export default {
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
} satisfies ShellContribution;
