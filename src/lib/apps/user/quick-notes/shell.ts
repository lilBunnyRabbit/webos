import kernel, { type AppsService, type DialogsService, type FilesService, type WindowsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { tilde_path } from "$lib/core/api/services/files/path";
import CaptureDialog, { type Capture } from "./capture-dialog.svelte";
import {
  add_todo,
  clear_todos,
  newest_first,
  NoteStatus,
  OPEN_STATUSES,
  parse_todos,
  resolve_note,
  serialize_note,
  set_todo,
  tags_of,
  title_of,
  type Note,
  type Todo,
} from "./notes";
import { create_note, delete_note, list_notes, read_todo, save_note, write_todo } from "./store";

export const APP_ID = "quick-notes";

const files = () => kernel.service<FilesService>("files");

export function note_value(note: Note): Tagged {
  return {
    $type: "note",
    id: note.id,
    status: note.status,
    title: title_of(note.body),
    tags: tags_of(note.body).join(" "),
    created: note.created.slice(0, 10),
  };
}

export function todo_value(todo: Todo): Tagged {
  return { $type: "todo", n: todo.n, done: todo.done, text: todo.text };
}

/** quno stamps the repo and branch; here it's whatever had focus: the app, and the file it has open. */
export function stamp(cwd?: string): string {
  const windows = kernel.service<WindowsService>("windows");
  const focused = windows.get_focused();
  const instance = focused ? windows.get(focused) : null;
  if (!instance || instance.app.id === APP_ID) return "";
  if (instance.app.id === "terminal" && cwd) return `terminal ${tilde_path(cwd)}`;
  const path = instance.app.props?.path;
  return typeof path === "string" ? `${instance.app.id} ${path}` : instance.app.id;
}

export async function capture(text: string, from: string): Promise<Tagged> {
  return note_value(await create_note(files(), text, from));
}

export async function capture_todo(text: string): Promise<void> {
  await write_todo(files(), add_todo(await read_todo(files()), text));
}

export async function note({ args, session }: CommandContext<{ text: string[] }>): Promise<Tagged | string | void> {
  const from = stamp(session.cwd);
  const text = args.text.join(" ").trim();
  if (text) return capture(text, from);

  const result = await kernel.service<DialogsService>("dialogs").show<Capture, { from: string }>(CaptureDialog, { from });
  if (!result) return;
  if (result.kind === "todo") {
    await capture_todo(result.text);
    return `added todo: ${result.text}`;
  }
  return capture(result.text, from);
}

export async function* notes({ args }: CommandContext<{ status?: string; all: boolean }>): AsyncGenerator<Tagged> {
  const list = (await list_notes(files())).sort(newest_first);
  for (const note of list) {
    if (args.status ? note.status === args.status : args.all || OPEN_STATUSES.includes(note.status)) yield note_value(note);
  }
}

async function find(query: string): Promise<Note> {
  const found = resolve_note(await list_notes(files()), query);
  if (typeof found === "string") throw new ShellError(found);
  return found;
}

export async function cat({ args }: CommandContext<{ note: string }>): Promise<string> {
  return serialize_note(await find(args.note));
}

export async function set_status({ args }: CommandContext<{ note: string }>, status: NoteStatus): Promise<Tagged> {
  const note = { ...(await find(args.note)), status };
  await save_note(files(), note);
  return note_value(note);
}

export async function remove({ args }: CommandContext<{ note: string }>): Promise<string> {
  const note = await find(args.note);
  await delete_note(files(), note);
  return `removed ${note.id} ${title_of(note.body)}`;
}

export async function* todo({ args }: CommandContext<{ text: string[] }>): AsyncGenerator<Tagged | string> {
  const text = args.text.join(" ").trim();
  if (text) {
    await capture_todo(text);
    const added = parse_todos(await read_todo(files())).at(-1);
    if (added) yield todo_value(added);
    return;
  }
  for (const todo of parse_todos(await read_todo(files()))) yield todo_value(todo);
}

export async function toggle_todo(n: number, done: boolean): Promise<Todo> {
  const next = set_todo(await read_todo(files()), n, done);
  if (next === null) throw new ShellError(`no todo ${n}`);
  await write_todo(files(), next);
  return parse_todos(next).find((todo) => todo.n === n)!;
}

export async function todo_done({ args }: CommandContext<{ n: number }>): Promise<Tagged> {
  return todo_value(await toggle_todo(args.n, true));
}

export async function todo_clear({ args }: CommandContext<{ all: boolean }>): Promise<string> {
  const { text, removed } = clear_todos(await read_todo(files()), args.all);
  await write_todo(files(), text);
  return `cleared ${removed}`;
}

export function open_note(id: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { note: id });
}

export async function open_app(query?: string): Promise<void> {
  if (!query) {
    kernel.service<AppsService>("apps").launch(APP_ID);
    return;
  }
  open_note((await find(query)).id);
}

export async function complete_notes(partial: string) {
  const query = partial.toLowerCase();
  return (await list_notes(files()))
    .filter((note) => OPEN_STATUSES.includes(note.status))
    .sort(newest_first)
    .filter((note) => note.id.startsWith(query) || title_of(note.body).toLowerCase().includes(query))
    .map((note) => ({ value: note.id, detail: title_of(note.body) }));
}
