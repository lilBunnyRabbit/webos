import { z } from "zod";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { NOTE_STATUSES, NoteStatus } from "./notes";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const note_arg = () => arg.kind("note");

export default {
  completers: {
    note: async (partial) => (await logic()).complete_notes(partial),
  },
  values: {
    note: {
      columns: ["id", "status", "title", "tags", "created"],
      text: (note) => `${note.id}  ${String(note.status).padEnd(7)} ${note.title}`,
      open: (note) => void logic().then((m) => m.open_note(String(note.id))),
    },
    todo: {
      columns: ["n", "done", "text"],
      text: (todo) => `${String(todo.n).padStart(2)} [${todo.done ? "x" : " "}] ${todo.text}`,
      cell: (todo, column) => (column === "done" ? (todo.done ? "[x]" : "[ ]") : String(todo[column])),
      open: (todo) => void logic().then((m) => m.toggle_todo(Number(todo.n), !todo.done)),
    },
  },
  commands: [
    define_command({
      id: "quno",
      description: "Open Quick Notes, or one note",
      args: z.object({ note: note_arg().optional() }),
      positional: ["note"],
      run: async ({ args }) => (await logic()).open_app(args.note),
    }),
    define_command({
      id: "quno q",
      description: "Capture a note; no text opens the capture box",
      args: z.object({ text: z.array(z.string()).default([]).describe("The note, #tags inline") }),
      positional: ["text"],
      yields: "note",
      run: async (context) => (await logic()).note(context),
    }),
    define_command({
      id: "quno ls",
      description: "Notes, newest first: open ones, or -s <status>, or -a for all",
      args: z.object({
        status: z.enum(NOTE_STATUSES).optional().describe("Only this status"),
        all: z.boolean().default(false).describe("Include done and dropped"),
      }),
      short: { status: "s", all: "a" },
      yields: "note",
      async *run(context) {
        yield* (await logic()).notes(context);
      },
    }),
    define_command({
      id: "quno cat",
      description: "Print a note",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      run: async (context) => (await logic()).cat(context),
    }),
    define_command({
      id: "quno ready",
      description: "Mark a note triaged",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      yields: "note",
      run: async (context) => (await logic()).set_status(context, NoteStatus.READY),
    }),
    define_command({
      id: "quno done",
      description: "Mark a note done",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      yields: "note",
      run: async (context) => (await logic()).set_status(context, NoteStatus.DONE),
    }),
    define_command({
      id: "quno drop",
      description: "Drop a note (it stays on disk, -a lists it)",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      yields: "note",
      run: async (context) => (await logic()).set_status(context, NoteStatus.DROPPED),
    }),
    define_command({
      id: "quno rm",
      description: "Delete a note's file",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      run: async (context) => (await logic()).remove(context),
    }),
    define_command({
      id: "quno pin",
      description: "Pin a note to the desktop as a sticky",
      args: z.object({ note: note_arg() }),
      positional: ["note"],
      run: async (context) => (await logic()).pin(context),
    }),
    define_command({
      id: "quno t pin",
      description: "Pin the todo list to the desktop",
      run: async () => (await logic()).todo_pin(),
    }),
    define_command({
      id: "quno t",
      description: "Add a todo, or list them with no text",
      args: z.object({ text: z.array(z.string()).default([]).describe("The todo, #tags inline") }),
      positional: ["text"],
      yields: "todo",
      async *run(context) {
        yield* (await logic()).todo(context);
      },
    }),
    define_command({
      id: "quno t done",
      description: "Check off todo n",
      args: z.object({ n: z.number().int().min(1) }),
      positional: ["n"],
      yields: "todo",
      run: async (context) => (await logic()).todo_done(context),
    }),
    define_command({
      id: "quno t clear",
      description: "Remove checked todos, -a for all",
      args: z.object({ all: z.boolean().default(false) }),
      short: { all: "a" },
      run: async (context) => (await logic()).todo_clear(context),
    }),
  ],
} satisfies ShellContribution;
