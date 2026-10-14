import type { FilesService } from "$lib/core/api";
import { file_name_for, new_id, NOTES_DIR, NoteStatus, parse_note, serialize_note, TODO_FILE, TODO_PATH, type Note } from "./notes";

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

export async function save_note(files: FilesService, note: Note): Promise<void> {
  await files.create_file(await notes_directory(files), note.file, { content: serialize_note(note), overwrite: true });
}

export async function create_note(files: FilesService, body: string, from: string): Promise<Note> {
  const directory = await notes_directory(files);
  const notes = await list_notes(files);
  const created = new Date();
  const id = new_id(notes.map((note) => note.id));
  const note: Note = { id, file: "", status: NoteStatus.RAW, created: created.toISOString(), from, body };
  const handle = await files.create_file(directory, file_name_for(body, created), { content: serialize_note({ ...note, file: "" }) });
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
