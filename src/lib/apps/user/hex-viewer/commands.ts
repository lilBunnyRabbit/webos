import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_bytes } from "$lib/core/utils";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";
import { offset } from "./index";

const logic = () => import("./shell");

export default {
  values: {
    "hex-row": {
      columns: ["offset", "hex", "ascii"],
      cell: (row, column) => (column === "offset" ? Number(row.offset).toString(16).padStart(8, "0") : String(row[column] ?? "")),
      text: (row) => `${Number(row.offset).toString(16).padStart(8, "0")}: ${row.hex}  ${row.ascii}`,
      open: (row) => void logic().then((m) => m.open_at(String(row.path), Number(row.offset))),
    },
    "file-type": {
      columns: ["name", "type", "details", "size", "entropy"],
      cell(value, column) {
        if (column === "size") return value.size === null ? "—" : format_bytes(Number(value.size));
        if (column === "entropy") return value.entropy === null ? "—" : Number(value.entropy).toFixed(2);
        return String(value[column] ?? "");
      },
      text: (value) => `${value.name}: ${[value.type, value.details].filter(Boolean).join(", ")}`,
      open(value) {
        if (value.type !== "directory") void logic().then((m) => m.open_at(String(value.path), 0));
      },
    },
    "file-hit": {
      columns: ["name", "offset", "type", "details"],
      cell: (hit, column) => (column === "offset" ? Number(hit.offset).toString(16).padStart(8, "0") : String(hit[column] ?? "")),
      text: (hit) => `${hit.name} ${Number(hit.offset).toString(16).padStart(8, "0")}: ${[hit.type, hit.details].filter(Boolean).join(", ")}`,
      open: (hit) => void logic().then((m) => m.open_at(String(hit.path), Number(hit.offset))),
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
    define_command({
      id: "file",
      description: "What files are by their bytes, with entropy; --scan lists files embedded inside them",
      args: z.object({
        paths: z.array(arg.path()).default([]),
        scan: z.boolean().default(false).describe("List embedded signatures by offset; click one to open Hex Viewer there"),
      }),
      positional: ["paths"],
      yields: "file-type",
      async *run(context) {
        yield* (await logic()).file(context);
      },
    }),
  ],
} satisfies ShellContribution;
