import type { FilesService } from "$lib/core/api";
import {
  file_name_for,
  new_id,
  NOTES_DIR,
  NoteStatus,
  parse_note,
  serialize_note,
  TODO_FILE,
  TODO_PATH,
  type Note,
} from "./notes";

/** Notes are plain files in `/home/Notes`, so Text Editor, Explorer and `cat` work on them too. */
export async function notes_directory(files: FilesService): Promise<FileSystemDirectoryHandle> {
  const existing = await files.get_directory(NOTES_DIR);
  if (existing) return existing;
  return files.create_directory(await files.get_directory("/home"), "Notes");
}

export async function list_notes(files: FilesService): Promise<Note[]> {
  const directory = await files.get_directory(NOTES_DIR);
  if (!directory) return [];
  const items = await files.list(directory);
  const notes = await Promise.all(
    items.map(async (item) => {
      if (item.kind !== "file" || !item.name.endsWith(".md") || item.name === TODO_FILE) return null;
      return parse_note(item.name, await (await files.read_file(item.handle)).text());
    })
  );
  return notes.filter((note) => note !== null);
}

/**
 * Lists `/home/Notes` again after a change, parsing only the files whose `lastModified` moved: every save bumps the
 * folder's revision, and most of them touch one note.
 */
export class NotesReader {
  private readonly cache = new Map<string, { modified: number; note: Note | null }>();

  constructor(private readonly files: () => FilesService) {}

  async list(): Promise<Note[]> {
    const directory = await this.files().get_directory(NOTES_DIR);
    if (!directory) {
      this.cache.clear();
      return [];
    }
    const items = await this.files().list(directory);
    const names = new Set<string>();
    const notes = await Promise.all(
      items.map(async (item) => {
        if (item.kind !== "file" || !item.name.endsWith(".md") || item.name === TODO_FILE) return null;
        names.add(item.name);
        return this.read(item.name, await this.files().read_file(item.handle));
      })
    );
    for (const name of this.cache.keys()) if (!names.has(name)) this.cache.delete(name);
    return notes.filter((note) => note !== null);
  }

  /** One note by id prefix: its last known file when that still holds it, else a full listing. */
  async find(prefix: string): Promise<Note | null> {
    const known = [...this.cache].find(([, entry]) => entry.note?.id.startsWith(prefix))?.[0];
    if (known) {
      const file = await this.files().get_file(`${NOTES_DIR}/${known}`);
      const note = file ? await this.read(known, file) : null;
      if (note?.id.startsWith(prefix)) return note;
    }
    return (await this.list()).find((note) => note.id.startsWith(prefix)) ?? null;
  }

  private async read(name: string, file: File): Promise<Note | null> {
    const cached = this.cache.get(name);
    if (cached?.modified === file.lastModified) return cached.note;
    const note = parse_note(name, await file.text());
    this.cache.set(name, { modified: file.lastModified, note });
    return note;
  }
}

export async function save_note(files: FilesService, note: Note): Promise<void> {
  await files.create_file(await notes_directory(files), note.file, { content: serialize_note(note), overwrite: true });
}

export async function create_note(files: FilesService, body: string, from: string): Promise<Note> {
  const directory = await notes_directory(files);
  const notes = await list_notes(files);
  const created = new Date();
  const id = new_id(notes.map((note) => note.id));
  const note: Note = { id, file: "", status: NoteStatus.RAW, created: created.toISOString(), from, body };
  const handle = await files.create_file(directory, file_name_for(body, created), {
    content: serialize_note({ ...note, file: "" }),
  });
  return { ...note, file: handle.name };
}

export async function delete_note(files: FilesService, note: Note): Promise<void> {
  await files.delete_entry(await notes_directory(files), note.file);
}

export async function read_todo(files: FilesService): Promise<string> {
  return (await (await files.get_file(TODO_PATH))?.text()) ?? "";
}

export async function write_todo(files: FilesService, text: string): Promise<void> {
  await files.create_file(await notes_directory(files), TODO_FILE, { content: text, overwrite: true });
}
