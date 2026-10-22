import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { base_name, file_extension, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellService, type ShellSession, type Tagged } from "$lib/core/api/services/shell/type";
import { error_message } from "$lib/core/utils";
import { build_docx } from "./docx";
import { EXTENSION, parse_document } from "./format";
import { stem_of } from "./io";
import { to_markdown } from "./markdown";
import { document_text } from "./model";
import { count } from "./words";

const APP_ID = "warren";
const files = () => kernel.service<FilesService>("files");

export function open(path: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path });
}

export async function complete_documents(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || file_extension(item.value) === EXTENSION);
}

async function load(command: string, path: string) {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${command}: ${path}: no such file`);
  try {
    return parse_document(await file.text());
  } catch (error) {
    throw new ShellError(`${command}: ${path}: ${error_message(error)}`);
  }
}

export async function count_document({ args, session }: CommandContext<{ path: string }>): Promise<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const { words, characters } = count(document_text((await load("doc count", path)).editor));
  return { $type: "doc-count", name: base_name(path), path, words, characters };
}

export async function export_document({ args, session, elevated }: CommandContext<{ path: string; docx: boolean; md: boolean }>): Promise<FileValue> {
  if (args.docx === args.md) throw new ShellError("doc export: pick one format: --docx or --md");
  const path = resolve_path(session.cwd, args.path);
  const document = await load("doc export", path);
  const folder = parent_path(path);
  const name = `${stem_of(path)}.${args.md ? "md" : "docx"}`;
  assert_writable(`${folder === "/" ? "" : folder}/${name}`, elevated);
  const directory = await files().get_directory(folder);
  if (!directory) throw new ShellError(`doc export: ${folder}: no such folder`);
  const handle = await files().create_file(directory, name, { content: args.md ? to_markdown(document.editor) : await build_docx(document, stem_of(path)) });
  const written = `${folder === "/" ? "" : folder}/${handle.name}`;
  const file = await files().get_file(written);
  return file_value(written, "file", file?.size ?? null, file?.lastModified ?? null);
}
