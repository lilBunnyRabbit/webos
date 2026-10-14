import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_bytes } from "$lib/core/utils";
import { FileZip as FileZipIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "archive",
  name: "Archive",
  icon: FileZipIcon,
  version: "1.0.0",
  description: "Opens, extracts and creates zip archives, right in the browser.",
  keywords: ["zip", "unzip", "compress", "extract", "decompress", "archive", "deflate", "files", "folder"],
  category: AppCategory.UTILITIES,
  associations: [".zip", "application/zip", "application/x-zip-compressed"],
  props: z.object({ path: z.string().optional(), paths: z.array(z.string()).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 320 },
    },
  },
  shell: {
    values: {
      "zip-entry": {
        columns: ["name", "size", "packed", "saved"],
        cell(entry, column) {
          if (column === "size" || column === "packed") return format_bytes(Number(entry[column]));
          if (column === "saved") return entry.saved === null ? "—" : `${entry.saved}%`;
          return String(entry[column] ?? "");
        },
        text: (entry) => `${entry.name}  ${format_bytes(Number(entry.size))}`,
        open: (entry) => void logic().then((m) => m.open_archive(String(entry.archive))),
      },
    },
    commands: [
      define_command({
        id: "zip",
        description: "Compress files and folders into a zip, or the piped files",
        args: z.object({
          paths: z.array(arg.path()).default([]),
          to: arg.path().optional().describe("The zip, or a folder to put it in"),
          store: z.boolean().default(false).describe("Bundle without compressing"),
        }),
        positional: ["paths"],
        yields: "file",
        run: async (context) => (await logic()).zip(context),
      }),
      define_command({
        id: "zip list",
        description: "The files inside a zip",
        args: z.object({ path: arg.path() }),
        positional: ["path"],
        yields: "zip-entry",
        async *run(context) {
          yield* (await logic()).list(context);
        },
      }),
      define_command({
        id: "unzip",
        description: "Extract a zip into a new folder named after it",
        args: z.object({
          path: arg.path(),
          to: arg.path().optional().describe("Where the new folder goes; the current folder by default"),
        }),
        positional: ["path"],
        yields: "file",
        run: async (context) => (await logic()).unzip(context),
      }),
    ],
  },
  component: () => import("./archive.app.svelte"),
});
