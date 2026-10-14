export const NOTES_DIR = "/home/Notes";
export const TODO_FILE = "todo.md";
export const TODO_PATH = `${NOTES_DIR}/${TODO_FILE}`;

export const NoteStatus = {
  RAW: "raw",
  READY: "ready",
  DONE: "done",
  DROPPED: "dropped",
} as const;
export type NoteStatus = (typeof NoteStatus)[keyof typeof NoteStatus];
export const NOTE_STATUSES = Object.values(NoteStatus);
export const OPEN_STATUSES: readonly NoteStatus[] = [NoteStatus.RAW, NoteStatus.READY];

export interface Note {
  id: string;
  /** File name inside `NOTES_DIR`. */
  file: string;
  status: NoteStatus;
  /** ISO timestamp. */
  created: string;
  /** What was focused at capture: an app id, then its file or cwd. */
  from: string;
  body: string;
}

const TAG = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

export function tags_of(text: string): string[] {
  return [...new Set([...text.matchAll(TAG)].map((match) => match[1].toLowerCase()))];
}

export function title_of(body: string): string {
  const line = body.split("\n").find((line) => line.trim() !== "") ?? "";
  return (
    line
      .replace(/^#+\s*/, "")
      .replace(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_, target: string, alias?: string) => alias?.trim() || target.trim())
      .trim() || "Untitled"
  );
}

export function new_id(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (;;) {
    const id = [...crypto.getRandomValues(new Uint8Array(4))].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 7);
    if (!used.has(id)) return id;
  }
}

export function slugify(text: string, words = 5): string {
  const slug = text
    .toLowerCase()
    .replace(TAG, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, words)
    .join("-");
  return slug || "note";
}

export function file_name_for(text: string, created: Date): string {
  const day = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
  return `${day}-${slugify(title_of(text))}.md`;
}

/** Frontmatter is flat `key: value` lines, so the file stays readable in any editor (and in Obsidian, like quno's vault). */
export function parse_note(file: string, raw: string): Note | null {
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const front: Record<string, string> = {};
  for (const line of raw.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) front[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  if (!/^[0-9a-f]{7}$/.test(front.id ?? "")) return null;
  const status = (NOTE_STATUSES as string[]).includes(front.status) ? (front.status as NoteStatus) : NoteStatus.RAW;
  return { id: front.id, file, status, created: front.created ?? "", from: front.from ?? "", body: raw.slice(end + 5).replace(/^\n/, "").replace(/\n$/, "") };
}

export function serialize_note(note: Note): string {
  const front = [`id: ${note.id}`, `status: ${note.status}`, `created: ${note.created}`];
  if (note.from) front.push(`from: ${note.from}`);
  // Exactly one newline is added after the body and parse_note takes exactly one off, so the text round-trips as typed.
  return `---\n${front.join("\n")}\n---\n\n${note.body}\n`;
}

/** quno's lookup: an id prefix of 3+ characters, then a unique title substring. */
export function resolve_note(notes: Note[], query: string): Note | string {
  const q = query.trim().toLowerCase();
  if (q.length >= 3) {
    const by_id = notes.filter((note) => note.id.startsWith(q));
    if (by_id.length === 1) return by_id[0];
    if (by_id.length > 1) return `"${query}" matches ${by_id.length} notes, type more of the id`;
  }
  const by_title = notes.filter((note) => title_of(note.body).toLowerCase().includes(q));
  if (by_title.length === 1) return by_title[0];
  return by_title.length === 0 ? `no note "${query}"` : `"${query}" matches ${by_title.length} notes`;
}

export function newest_first(a: Note, b: Note): number {
  return b.created.localeCompare(a.created);
}

export interface Todo {
  /** 1-based, among todo lines only: what `todo done <n>` takes. */
  n: number;
  /** Index into the file's lines. */
  line: number;
  done: boolean;
  text: string;
}

const TODO = /^- \[( |x|X)\] (.*)$/;

export function parse_todos(text: string): Todo[] {
  const todos: Todo[] = [];
  text.split("\n").forEach((line, index) => {
    const match = TODO.exec(line);
    if (match) todos.push({ n: todos.length + 1, line: index, done: match[1] !== " ", text: match[2] });
  });
  return todos;
}

function lines_of(text: string): string[] {
  const trimmed = text.replace(/\n+$/, "");
  return trimmed === "" ? [] : trimmed.split("\n");
}

const join = (lines: string[]) => (lines.length ? `${lines.join("\n")}\n` : "");

export function add_todo(text: string, todo: string): string {
  return join([...lines_of(text), `- [ ] ${todo.trim()}`]);
}

export function set_todo(text: string, n: number, done: boolean): string | null {
  const todo = parse_todos(text).find((todo) => todo.n === n);
  if (!todo) return null;
  const lines = text.split("\n");
  lines[todo.line] = `- [${done ? "x" : " "}] ${todo.text}`;
  return lines.join("\n");
}

export function remove_todo(text: string, n: number): string | null {
  const todo = parse_todos(text).find((todo) => todo.n === n);
  if (!todo) return null;
  const lines = text.split("\n");
  lines.splice(todo.line, 1);
  return lines.join("\n");
}

/** Drops checked todos, or every todo with `all`; other lines (headings, notes) stay. */
export function clear_todos(text: string, all = false): { text: string; removed: number } {
  let removed = 0;
  const kept = lines_of(text).filter((line) => {
    const match = TODO.exec(line);
    const drop = match !== null && (all || match[1] !== " ");
    if (drop) removed++;
    return !drop;
  });
  return { text: join(kept), removed };
}

const LINK = /\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]/g;

/** `[[target]]`, `[[target|alias]]` and `[[target#heading]]` targets, in order, once each (Obsidian syntax). */
export function links_of(body: string): string[] {
  return [...new Set([...body.matchAll(LINK)].map((match) => match[1].trim()).filter(Boolean))];
}

/** A link target as Obsidian would write it (file name without `.md`), or by id or title, which quno users type. */
export function resolve_link(notes: Note[], target: string): Note | null {
  const t = target.trim().toLowerCase();
  const by_prefix = t.length >= 3 ? notes.filter((note) => note.id.startsWith(t)) : [];
  return (
    notes.find((note) => note.id === t) ??
    notes.find((note) => note.file.toLowerCase() === `${t}.md`) ??
    notes.find((note) => title_of(note.body).toLowerCase() === t) ??
    (by_prefix.length === 1 ? by_prefix[0] : null)
  );
}

export function backlinks_of(notes: Note[], target: Note): Note[] {
  return notes.filter((note) => note.id !== target.id && links_of(note.body).some((link) => resolve_link(notes, link)?.id === target.id));
}
