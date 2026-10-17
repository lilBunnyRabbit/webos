import { z } from "zod";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const board_arg = () => z.string().optional().describe("Board name");

const complete_board = (field: string, partial: string) =>
  field === "board" ? logic().then((m) => m.complete_boards(partial)) : undefined;

export default {
  completers: {
    pad: async (partial) => (await logic()).complete_pads(partial),
  },
  values: {
    pad: {
      columns: ["key", "label", "board", "loop"],
      text: (pad) =>
        `${String(pad.key || "-")
          .toUpperCase()
          .padEnd(2)} ${pad.label}${pad.loop ? " (loop)" : ""}  ${pad.board}`,
      cell: (pad, column) =>
        column === "key"
          ? String(pad.key).toUpperCase()
          : column === "loop"
            ? pad.loop
              ? "loop"
              : ""
            : String(pad[column] ?? ""),
      open: (pad) => void logic().then((m) => m.open_pad(String(pad.id))),
    },
  },
  commands: [
    define_command({
      id: "sb",
      description: "Open Soundboard",
      run: async () => (await logic()).open_app(),
    }),
    define_command({
      id: "sb ls",
      description: "The pads on every board, or on -b <board>",
      args: z.object({ board: board_arg() }),
      short: { board: "b" },
      yields: "pad",
      complete: complete_board,
      async *run(context) {
        yield* (await logic()).list(context);
      },
    }),
    define_command({
      id: "sb play",
      description: "Play a pad by label or key; a loop pad that's playing stops",
      args: z.object({ pad: arg.kind("pad"), board: board_arg() }),
      positional: ["pad"],
      short: { board: "b" },
      complete: complete_board,
      run: async (context) => (await logic()).play(context),
    }),
    define_command({
      id: "sb stop",
      description: "Stop every sound",
      run: async () => (await logic()).stop(),
    }),
    define_command({
      id: "sb add",
      description: "Add audio files as pads, to the first board or -b <board>",
      args: z.object({ paths: z.array(arg.path()).default([]), board: board_arg() }),
      positional: ["paths"],
      short: { board: "b" },
      yields: "pad",
      complete: complete_board,
      async *run(context) {
        yield* (await logic()).add(context);
      },
    }),
  ],
} satisfies ShellContribution;
