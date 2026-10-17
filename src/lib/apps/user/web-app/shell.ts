import kernel, { type FilesService } from "$lib/core/api";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { error_message } from "$lib/core/utils";
import { url_error, write_web_app } from "./store";
import { DESKTOP_DIR, name_from_url, normalize_url } from "./web-app";

export async function add({ args, elevated }: CommandContext<{ url: string; name?: string }>): Promise<FileValue> {
  const problem = url_error(args.url, location.origin);
  const url = normalize_url(args.url);
  if (problem || !url) throw new ShellError(`${args.url}: ${problem ?? "not a web address"}`);
  const files = kernel.service<FilesService>("files");
  assert_writable(DESKTOP_DIR, elevated);
  try {
    const path = await write_web_app(files, DESKTOP_DIR, { name: args.name?.trim() || name_from_url(url), url });
    const file = await files.get_file(path);
    return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
  } catch (error) {
    throw new ShellError(error_message(error));
  }
}
