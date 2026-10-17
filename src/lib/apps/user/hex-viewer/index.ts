import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { Binary as BinaryIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");
const offset = z.number().int().min(0);

export default define_app({
  id: "hex-viewer",
  name: "Hex Viewer",
  icon: BinaryIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Shows the raw bytes of any file, however large, as hex and ASCII side by side.",
  keywords: ["hex", "binary", "bytes", "dump", "xxd", "hexdump", "inspect", "offset"],
  props: z.object({ path: z.string().optional(), offset: offset.optional() }),
  tools: ["*"],
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 280 },
    },
  },
  shell: {
    values: {
      "hex-row": {
        columns: ["offset", "hex", "ascii"],
        cell: (row, column) => (column === "offset" ? Number(row.offset).toString(16).padStart(8, "0") : String(row[column] ?? "")),
        text: (row) => `${Number(row.offset).toString(16).padStart(8, "0")}: ${row.hex}  ${row.ascii}`,
        open: (row) => void logic().then((m) => m.open_at(String(row.path), Number(row.offset))),
      },
    },
    commands: [
      define_command({
        id: "hexdump",
        description: "The bytes of a file as hex and ASCII rows; click a row to open Hex Viewer there",
        args: z.object({
          path: arg.path(),
          length: z.number().int().min(1).default(256).describe("Bytes to show"),
          offset: offset.default(0).describe("Where to start, in bytes (0x10 works)"),
        }),
        positional: ["path"],
        short: { length: "l", offset: "s" },
        yields: "hex-row",
        async *run(context) {
          yield* (await logic()).hexdump(context);
        },
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./hex-viewer.app.svelte"),
});
