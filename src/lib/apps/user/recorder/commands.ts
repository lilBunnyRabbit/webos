import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_bytes, format_datetime } from "$lib/core/utils";
import { SOURCES } from "./props";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: {
    recording: {
      columns: ["name", "kind", "size", "date"],
      text: (value) => `${value.name}  ${value.kind}`,
      cell: (value, column) =>
        column === "size"
          ? format_bytes(Number(value.size))
          : column === "date"
            ? format_datetime(Number(value.date))
            : String(value[column] ?? ""),
      open: (value) => void logic().then((m) => m.open_recording(String(value.path))),
    },
  },
  commands: [
    define_command({
      id: "rec list",
      description: "Recordings, newest first",
      yields: "recording",
      async *run() {
        yield* (await logic()).list();
      },
    }),
    define_command({
      id: "rec start",
      description: "Open Recorder ready to record from a source",
      args: z.object({ source: z.enum(SOURCES).default("mic") }),
      short: { source: "s" },
      run: async (context) => (await logic()).start(context),
    }),
  ],
} satisfies ShellContribution;
