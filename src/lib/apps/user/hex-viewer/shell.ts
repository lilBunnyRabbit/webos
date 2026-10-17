import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { is_file_value } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { read_zip } from "$lib/core/utils/zip/read";
import { APP_ID, dump_blob } from "./hex";
import { Container, count_bytes, entropy, gunzip_head, gzip_identity, identify, scan, scan_state, with_entropy, zip_identity, type Identity } from "./identify";

const HEAD = 64 * 1024;
const CHUNK = 4 * 1024 * 1024;
const SCAN_TAIL = 64 * 1024;

const files = () => kernel.service<FilesService>("files");

export async function* hexdump({ args, session, signal }: CommandContext<{ path: string; length: number; offset: number }>): AsyncGenerator<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`hexdump: ${path}: no such file`);
  yield* dump_blob(file, path, args.offset, args.length, signal);
}

export function open_at(path: string, offset: number): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path, offset });
}

async function paths_from(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given.map((path) => resolve_path(context.session.cwd, path));
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(resolve_path(context.session.cwd, value));
  }
  return paths;
}

const name_of = (path: string) => path.slice(path.lastIndexOf("/") + 1) || path;

async function read(blob: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

async function refine(blob: Blob, head: Uint8Array<ArrayBuffer>, identity: Identity): Promise<Identity> {
  if (identity.container === Container.ZIP) {
    return read_zip(blob).then(
      (archive) => zip_identity(archive.entries.map((entry) => entry.name), identity),
      () => ({ ...identity, details: "damaged or cut off" })
    );
  }
  if (identity.container === Container.GZIP) return gzip_identity(await gunzip_head(head), identity);
  return identity;
}

async function entropy_of(blob: Blob, signal: AbortSignal): Promise<number | null> {
  const counts = new Float64Array(256);
  for (let start = 0; start < blob.size; start += CHUNK) {
    if (signal.aborted) return null;
    count_bytes(counts, await read(blob, start, start + CHUNK));
  }
  return entropy(counts);
}

async function describe(path: string, blob: Blob, signal: AbortSignal): Promise<Tagged | null> {
  const head = await read(blob, 0, HEAD);
  const identity = await refine(blob, head, identify(head, blob.size));
  const bits = await entropy_of(blob, signal);
  if (bits === null) return null;
  const { type, details } = with_entropy(identity, bits);
  return { $type: "file-type", path, name: name_of(path), type, details, size: blob.size, entropy: Math.round(bits * 1000) / 1000 };
}

async function* scan_blob(path: string, blob: Blob, signal: AbortSignal): AsyncGenerator<Tagged> {
  const state = scan_state();
  for (let start = 0; start < blob.size; start += CHUNK) {
    if (signal.aborted) return;
    const bytes = await read(blob, start, start + CHUNK + SCAN_TAIL);
    for (const hit of scan(bytes, start, Math.min(CHUNK, blob.size - start), state)) {
      yield { $type: "file-hit", path, name: name_of(path), offset: hit.offset, type: hit.type, details: hit.details };
    }
  }
}

export async function* file(context: CommandContext<{ paths: string[]; scan: boolean }>): AsyncGenerator<Tagged> {
  const { args, signal } = context;
  const paths = await paths_from(args.paths, context);
  if (!paths.length) throw new ShellError("file: no files given");
  for (const path of paths) {
    if (signal.aborted) return;
    const blob = await files().get_file(path);
    if (!blob) {
      if (!(await files().get_directory(path))) throw new ShellError(`file: ${path}: no such file`);
      if (!args.scan) yield { $type: "file-type", path, name: name_of(path), type: "directory", details: "", size: null, entropy: null };
      continue;
    }
    if (args.scan) yield* scan_blob(path, blob, signal);
    else {
      const value = await describe(path, blob, signal);
      if (value) yield value;
    }
  }
}
