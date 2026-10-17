import type { FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { read_note, type NoteCard } from "./folder";
import { file_name_for, fill_template, set_field } from "./frontmatter";

const is_note = (name: string) => /\.md$/i.test(name);

/** Parses only files whose `lastModified` moved, as Quick Notes does: most revision bumps touch one card. */
export class FolderReader {
  private readonly cache = new Map<string, { modified: number; note: NoteCard }>();
  private path: string | null = null;

  constructor(private readonly files: () => FilesService) {}

  // `null` for a deleted folder or a locked mount.
  async list(path: string): Promise<NoteCard[] | null> {
    if (path !== this.path) {
      this.cache.clear();
      this.path = path;
    }
    const directory = await this.files().get_directory(path);
    if (!directory) return null;
    const items = (await this.files().list(directory)).filter((item) => item.kind === "file" && is_note(item.name));
    const names = new Set(items.map((item) => item.name));
    for (const name of this.cache.keys()) if (!names.has(name)) this.cache.delete(name);
    const notes = await Promise.all(
      items.map(async (item) => {
        const file = await this.files().read_file(item.handle as FileSystemFileHandle);
        const cached = this.cache.get(item.name);
        if (cached?.modified === file.lastModified) return cached.note;
        const note = read_note(item.name, await file.text());
        this.cache.set(item.name, { modified: file.lastModified, note });
        return note;
      })
    );
    return notes.sort((a, b) => a.file.localeCompare(b.file));
  }
}

async function folder_of(files: FilesService, path: string): Promise<FileSystemDirectoryHandle> {
  const directory = await files.get_directory(path);
  if (!directory) throw new Error(`${path} isn't there any more`);
  return directory;
}

export async function write_card_field(files: FilesService, folder: string, file: string, field: string, value: string): Promise<void> {
  const path = join_path(split_path(folder), file);
  const current = await files.get_file(path);
  if (!current) throw new Error(`${path} isn't there any more`);
  const text = await current.text();
  const next = set_field(text, field, value);
  if (next !== text) await files.create_file(await folder_of(files, folder), file, { content: next, overwrite: true });
}

export interface NewNote {
  title: string;
  field: string;
  value: string;
  template: string | null;
}

export async function create_note(files: FilesService, folder: string, note: NewNote, now = new Date()): Promise<string> {
  const directory = await folder_of(files, folder);
  let text = `# ${note.title}\n`;
  if (note.template) {
    const template = await files.get_file(note.template);
    if (!template) throw new Error(`The template ${note.template} isn't there any more`);
    text = fill_template(await template.text(), note.title, now);
  }
  const taken = new Set((await files.list(directory)).map((item) => item.name));
  const name = file_name_for(note.title, taken);
  await files.create_file(directory, name, { content: set_field(text, note.field, note.value) });
  return name;
}
