import kernel, { type FilesService } from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { add_response, empty_answers, FORM_EXTENSION, parse_answers, serialize_answers, type AnswersFile } from "./answers";
import { parse_form } from "./form";
import { answers_path_for, locate, type FoundForm } from "./match";
import type { PastedAnswer } from "./link";

const files = () => kernel.service<FilesService>("files");

async function* walk(path: string, directory: FileSystemDirectoryHandle): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  for await (const [name, handle] of directory.entries()) {
    const child = `${path}/${name}`;
    if (handle.kind === "directory") yield* walk(child, handle as FileSystemDirectoryHandle);
    else yield { path: child, handle: handle as FileSystemFileHandle };
  }
}

/** Every `.form.md` under `/home`, newest first. */
export async function find_forms(): Promise<FoundForm[]> {
  const home = await files().get_directory(PATHS.home);
  if (!home) return [];
  const found: FoundForm[] = [];
  for await (const { path, handle } of walk(PATHS.home, home)) {
    if (!path.toLowerCase().endsWith(FORM_EXTENSION)) continue;
    const file = await handle.getFile();
    const form = parse_form(await file.text());
    found.push({ path, id: form.id, title: form.title, modified: file.lastModified });
  }
  return found.sort((a, b) => b.modified - a.modified);
}

export async function read_answers(path: string): Promise<AnswersFile | null | undefined> {
  const file = await files().get_file(path);
  return file ? parse_answers(await file.text()) : undefined;
}

export async function write_text(path: string, content: string): Promise<void> {
  const directory = await files().get_directory(parent_path(path));
  if (!directory) throw new Error(`Folder not found: ${parent_path(path)}`);
  await files().create_file(directory, base_name(path), { content, overwrite: true });
}

export const StoreOutcome = {
  SAVED: "saved",
  DUPLICATE: "duplicate",
  NO_FORM: "no form",
  UNREADABLE: "unreadable",
} as const;
export type StoreOutcome = (typeof StoreOutcome)[keyof typeof StoreOutcome];

export type StoreResult =
  | { outcome: typeof StoreOutcome.SAVED | typeof StoreOutcome.DUPLICATE; form_path: string; answers_path: string; count: number }
  | { outcome: typeof StoreOutcome.NO_FORM }
  | { outcome: typeof StoreOutcome.UNREADABLE; answers_path: string };

/** Finds the pasted answer's form and adds the answer to the `.answers` file beside it. */
export async function store_answer(pasted: PastedAnswer): Promise<StoreResult> {
  const form = locate(await find_forms(), pasted);
  if (!form) return { outcome: StoreOutcome.NO_FORM };

  const answers_path = answers_path_for(form.path);
  const existing = await read_answers(answers_path);
  if (existing === null) return { outcome: StoreOutcome.UNREADABLE, answers_path };

  const source = (await (await files().get_file(form.path))?.text()) ?? pasted.source ?? "";
  const { file, added } = add_response(existing ?? empty_answers(source), source, pasted.response);
  if (added) await write_text(answers_path, serialize_answers(file));
  return { outcome: added ? StoreOutcome.SAVED : StoreOutcome.DUPLICATE, form_path: form.path, answers_path, count: file.responses.length };
}

export interface FormOverview extends FoundForm {
  answers: number;
  latest: number | null;
}

export async function overview(): Promise<FormOverview[]> {
  return Promise.all(
    (await find_forms()).map(async (form) => {
      const responses = (await read_answers(answers_path_for(form.path)))?.responses ?? [];
      return { ...form, answers: responses.length, latest: responses.at(-1)?.submitted_at ?? null };
    })
  );
}
