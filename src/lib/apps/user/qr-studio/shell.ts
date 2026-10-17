import kernel, { type FilesService } from "$lib/core/api";
import { available_name } from "$lib/core/api/services/files/opfs";
import { base_name, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { error_message } from "$lib/core/utils";
import { write_image } from "$lib/core/utils/image";
import { encode } from "./encode/encode";
import type { Ecc } from "./encode/tables";
import { DEFAULT_STYLE, qr_canvas, qr_svg } from "./render";

const files = () => kernel.service<FilesService>("files");

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

async function text_from(words: string[], context: CommandContext<unknown>): Promise<string> {
  if (words.length > 0 || !context.piped) return words.join(" ");
  const lines: string[] = [];
  for await (const value of context.input) if (typeof value === "string") lines.push(value);
  return lines.join("\n");
}

async function target_for(out: string | undefined, cwd: string): Promise<string> {
  const typed = resolve_path(cwd, out ?? ".");
  const folder = await files().get_directory(typed);
  if (folder) return child_path(typed, await available_name(folder, "qr.png"));
  if (!(await files().get_directory(parent_path(typed)))) throw new ShellError(`qr: ${parent_path(typed)}: no such folder`);
  return /\.(png|svg)$/i.test(typed) ? typed : `${typed}.png`;
}

export async function qr(context: CommandContext<{ text: string[]; ecc: Ecc; out?: string }>): Promise<FileValue> {
  const { args, session, elevated } = context;
  const text = await text_from(args.text, context);
  if (text === "") throw new ShellError("qr: nothing to encode");

  let code;
  try {
    code = encode(text, { ecc: args.ecc });
  } catch (error) {
    throw new ShellError(`qr: ${error_message(error)}`);
  }

  const path = await target_for(args.out, session.cwd);
  assert_writable(path, elevated);
  if (/\.svg$/i.test(path)) {
    const folder = await files().get_directory(parent_path(path));
    const svg = qr_svg(code.size, code.modules, DEFAULT_STYLE);
    await files().create_file(folder!, base_name(path), { content: new Blob([svg], { type: "image/svg+xml" }), overwrite: true });
  } else {
    await write_image(path, qr_canvas(code.size, code.modules, DEFAULT_STYLE));
  }
  const file = await files().get_file(path);
  return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
}
