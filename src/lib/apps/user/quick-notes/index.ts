import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { NotePencil as NotePencilIcon } from "phosphor-svelte";
import { open_todos } from "./badge.svelte";
import { NOTE_STATUSES, NoteStatus } from "./notes";

const logic = () => import("./shell");
const note_arg = () => arg.kind("note");

export const QUICK_NOTES_PROPS = z.object({
  note: z.string().optional(),
  tab: z.enum(["inbox", "notes", "todo"]).optional(),
});

export default define_app({
  id: "quick-notes",
  name: "Quick Notes",
  icon: NotePencilIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Capture a note or a todo from anywhere, triage it later.",
  keywords: ["notes", "todo", "inbox", "capture", "quno"],
  props: QUICK_NOTES_PROPS,
  badge: open_todos,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 320 },
    },
  },
  shell: {
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
        id: "note",
        description: "Capture a note; no text opens the capture box",
        args: z.object({ text: z.array(z.string()).default([]).describe("The note, #tags inline") }),
        positional: ["text"],
        yields: "note",
        run: async (context) => (await logic()).note(context),
      }),
      define_command({
        id: "notes",
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
        id: "note cat",
        description: "Print a note",
        args: z.object({ note: note_arg() }),
        positional: ["note"],
        run: async (context) => (await logic()).cat(context),
      }),
      define_command({
        id: "note ready",
        description: "Mark a note triaged",
        args: z.object({ note: note_arg() }),
        positional: ["note"],
        yields: "note",
        run: async (context) => (await logic()).set_status(context, NoteStatus.READY),
      }),
      define_command({
        id: "note done",
        description: "Mark a note done",
        args: z.object({ note: note_arg() }),
        positional: ["note"],
        yields: "note",
        run: async (context) => (await logic()).set_status(context, NoteStatus.DONE),
      }),
      define_command({
        id: "note drop",
        description: "Drop a note (it stays on disk, -a lists it)",
        args: z.object({ note: note_arg() }),
        positional: ["note"],
        yields: "note",
        run: async (context) => (await logic()).set_status(context, NoteStatus.DROPPED),
      }),
      define_command({
        id: "note rm",
        description: "Delete a note's file",
        args: z.object({ note: note_arg() }),
        positional: ["note"],
        run: async (context) => (await logic()).remove(context),
      }),
      define_command({
        id: "todo",
        description: "Add a todo, or list them with no text",
        args: z.object({ text: z.array(z.string()).default([]).describe("The todo, #tags inline") }),
        positional: ["text"],
        yields: "todo",
        async *run(context) {
          yield* (await logic()).todo(context);
        },
      }),
      define_command({
        id: "todo done",
        description: "Check off todo n",
        args: z.object({ n: z.number().int().min(1) }),
        positional: ["n"],
        yields: "todo",
        run: async (context) => (await logic()).todo_done(context),
      }),
      define_command({
        id: "todo clear",
        description: "Remove checked todos, -a for all",
        args: z.object({ all: z.boolean().default(false) }),
        short: { all: "a" },
        run: async (context) => (await logic()).todo_clear(context),
      }),
    ],
  },
  component: () => import("./quick-notes.app.svelte"),
});
