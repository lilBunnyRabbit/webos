import kernel, { type FilesService } from "$lib/core/api";
import { base_name, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { format_bytes } from "$lib/core/utils";
import { download, type DownloadTarget } from "./download";
import { empty_request } from "./http-file";
import { APP_ID, METHODS } from "./methods";
import { explain_fetch_error, header_value, parse_header, prepare, ResponseKind, status_line, type Prepared } from "./request";
import { pretty_json, send } from "./send";

const files = () => kernel.service<FilesService>("files");

async function folder_exists(path: string): Promise<void> {
  if (!(await files().get_directory(path))) throw new ShellError(`${path}: no such folder`);
}

function prepared(url: string, method = "GET", headers: string[] = [], body = ""): Prepared {
  const pairs = headers.map((text) => {
    const pair = parse_header(text);
    if (!pair) throw new ShellError(`-H "${text}": give a header as "Name: value"`);
    return pair;
  });
  if (body !== "" && header_value(pairs, "content-type") === undefined && pretty_json(body) !== null && /^\s*[[{]/.test(body))
    pairs.push({ name: "Content-Type", value: "application/json" });
  try {
    return prepare({ ...empty_request(), method, url, headers: pairs, body });
  } catch (error) {
    throw new ShellError(error instanceof Error ? error.message : String(error));
  }
}

async function save(request: Prepared, target: DownloadTarget, signal: AbortSignal): Promise<FileValue> {
  const result = await download(APP_ID, request, target, signal);
  if (!result.ok) throw new ShellError(result.cancelled ? "stopped" : result.error);
  const file = await files().get_file(result.path);
  return file_value(result.path, "file", file?.size ?? result.size, file?.lastModified ?? null);
}

async function output_target(cwd: string, output: string, elevated: boolean): Promise<DownloadTarget> {
  const path = resolve_path(cwd, output);
  assert_writable(path, elevated);
  if (await files().get_directory(path)) return { folder: path };
  await folder_exists(parent_path(path));
  return { folder: parent_path(path), name: base_name(path) };
}

export async function wget({
  args,
  session,
  signal,
  elevated,
}: CommandContext<{ url: string; to?: string; output?: string }>): Promise<FileValue> {
  const folder = resolve_path(session.cwd, args.to ?? ".");
  await folder_exists(folder);
  if (args.output !== undefined && /[/\\]/.test(args.output)) throw new ShellError(`-o ${args.output}: give a file name; use --to for the folder`);
  assert_writable(`${folder === "/" ? "" : folder}/${args.output ?? "file"}`, elevated);
  return save(prepared(args.url), { folder, name: args.output }, signal);
}

export interface HttpArgs {
  method: string;
  url: string;
  header: string[];
  data?: string;
  output?: string;
}

export async function* http({ args, session, signal, elevated }: CommandContext<HttpArgs>): AsyncGenerator<string | FileValue> {
  const method = args.method.toUpperCase();
  if (!(METHODS as readonly string[]).includes(method)) throw new ShellError(`${args.method}: not a method. Use ${METHODS.join(", ")}`);
  const request = prepared(args.url, method, args.header, args.data);
  if (args.output !== undefined) {
    yield await save(request, await output_target(session.cwd, args.output, elevated), signal);
    return;
  }
  const response = await send(request, signal).catch((error: unknown) => {
    if (signal.aborted) throw new ShellError("stopped");
    const { title, detail } = explain_fetch_error(error, request.url, { online: navigator.onLine, protocol: location.protocol });
    throw new ShellError(`${title}. ${detail}`);
  });
  yield `${status_line(response.status, response.status_text)} · ${Math.round(response.ms)} ms · ${format_bytes(response.blob.size)}`;
  if (response.blob.size === 0) return;
  if (response.text === null) {
    const what = response.kind === ResponseKind.IMAGE ? "an image" : response.kind === ResponseKind.BINARY ? "binary" : "too large to show";
    yield `The body is ${what} (${response.content_type || "no type"}). Save it with -o <path>`;
    return;
  }
  yield (response.kind === ResponseKind.JSON ? pretty_json(response.text) : null) ?? response.text;
}
