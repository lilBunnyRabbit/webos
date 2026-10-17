import kernel, { type FilesService } from "$lib/core/api";
import { base_name, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellService, type ShellSession } from "$lib/core/api/services/shell/type";
import { error_message } from "$lib/core/utils";
import { paint_colors, svelte_component } from "./component";
import {
  DEFAULT_OPTIONS,
  component_name,
  is_svg_name,
  optimize_svg,
  optimized_name,
  png_name,
  png_size,
  svg_size,
} from "./optimize";
import { rasterize } from "./raster";

const files = () => kernel.service<FilesService>("files");

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

async function folder_at(path: string): Promise<FileSystemDirectoryHandle> {
  const directory = await files().get_directory(path);
  if (!directory) throw new ShellError(`${path}: no such folder`);
  return directory;
}

export async function write_new(folder: string, name: string, content: string | Blob): Promise<string> {
  const handle = await files().create_file(await folder_at(folder), name, { content });
  return child_path(folder, handle.name);
}

export async function write_over(path: string, content: string | Blob): Promise<void> {
  await files().create_file(await folder_at(parent_path(path)), base_name(path), { content, overwrite: true });
}

async function read_svg(path: string): Promise<string> {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  return file.text();
}

async function written(path: string): Promise<FileValue> {
  const file = await files().get_file(path);
  return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
}

/** `-o` names a file to write (replacing it) or a folder to put a fresh name in; without it, beside the source. */
async function write_output(
  source: string,
  name: string,
  out: string | undefined,
  context: CommandContext<unknown>,
  content: string | Blob
): Promise<FileValue> {
  const typed = out === undefined ? null : resolve_path(context.session.cwd, out);
  const folder = typed === null ? parent_path(source) : (await files().get_directory(typed)) ? typed : null;
  if (folder !== null) {
    assert_writable(child_path(folder, name), context.elevated);
    return written(await write_new(folder, name, content));
  }
  const target = typed!;
  assert_writable(target, context.elevated);
  await write_over(target, content);
  return written(target);
}

async function optimized(path: string, text: string, precision: number): Promise<string> {
  try {
    return await optimize_svg(text, { ...DEFAULT_OPTIONS, precision });
  } catch (error) {
    throw new ShellError(`${path}: not SVG markup SVGO can read (${error_message(error).split("\n")[0]})`);
  }
}

export interface OptimizeArgs {
  path: string;
  out?: string;
  precision: number;
}

export async function optimize(context: CommandContext<OptimizeArgs>): Promise<FileValue> {
  const path = resolve_path(context.session.cwd, context.args.path);
  const output = await optimized(path, await read_svg(path), context.args.precision);
  return write_output(path, optimized_name(base_name(path)), context.args.out, context, output);
}

export interface PngArgs {
  path: string;
  size: number;
}

export async function png(context: CommandContext<PngArgs>): Promise<FileValue> {
  const path = resolve_path(context.session.cwd, context.args.path);
  const text = await read_svg(path);
  let blob: Blob;
  try {
    const canvas = await rasterize(text, png_size(svg_size(text), context.args.size));
    blob = await canvas.convertToBlob({ type: "image/png" });
  } catch (error) {
    throw new ShellError(`${path}: ${error_message(error)}`);
  }
  return write_output(path, png_name(base_name(path), context.args.size), undefined, context, blob);
}

export interface ComponentArgs {
  path: string;
  out?: string;
  size: number;
  colors: boolean;
}

export async function component(context: CommandContext<ComponentArgs>): Promise<FileValue> {
  const path = resolve_path(context.session.cwd, context.args.path);
  const output = await optimized(path, await read_svg(path), DEFAULT_OPTIONS.precision);
  const recolor = !context.args.colors && (await paint_colors(output)).length <= 1;
  const source = await svelte_component(output, { size: context.args.size, recolor });
  return write_output(path, `${component_name(base_name(path))}.svelte`, context.args.out, context, source);
}

export async function complete_svgs(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || is_svg_name(item.value));
}
