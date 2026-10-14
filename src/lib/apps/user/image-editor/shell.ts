import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { available_name } from "$lib/core/api/services/files/opfs";
import { resolve_path } from "$lib/core/api/services/files/path";
import { file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { extension_for, ImageFormat, parent_folder } from "$lib/core/utils/image";
import { DEFAULT_ADJUSTMENTS, format_of, name_for_format, OperationType, resize_size, type Operation, type Size } from "./edit";
import { encode, render_final, write_image } from "./render";

const APP_ID = "image-editor";
const DEFAULT_QUALITY = 92;

export const FORMATS = { png: ImageFormat.PNG, jpeg: ImageFormat.JPEG, webp: ImageFormat.WEBP } as const;
export type FormatName = keyof typeof FORMATS;

const files = () => kernel.service<FilesService>("files");
const name_of = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function decode(path: string): Promise<ImageBitmap> {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ShellError(`${path}: not an image this browser can read`);
  }
}

async function save_canvas(path: string, canvas: OffscreenCanvas, format: ImageFormat, quality: number): Promise<void> {
  await write_image(path, await encode(canvas, format, quality));
}

async function write_beside(path: string, operations: (size: Size) => Operation[], format: ImageFormat, quality = DEFAULT_QUALITY): Promise<FileValue> {
  const bitmap = await decode(path);
  try {
    const folder = parent_folder(path);
    const directory = await files().get_directory(folder);
    if (!directory) throw new ShellError(`${folder}: no such folder`);
    const name = await available_name(directory, name_for_format(name_of(path), format, extension_for(format)));
    const target = `${folder === "/" ? "" : folder}/${name}`;
    const canvas = render_final(bitmap, operations({ width: bitmap.width, height: bitmap.height }), DEFAULT_ADJUSTMENTS, format);
    await save_canvas(target, canvas, format, quality / 100);
    const written = await files().get_file(target);
    return file_value(target, "file", written?.size ?? null, written?.lastModified ?? null);
  } finally {
    bitmap.close();
  }
}

const own_format = (path: string) => format_of(name_of(path)) ?? ImageFormat.PNG;

export async function edit({ args, session }: CommandContext<{ path: string }>): Promise<void> {
  const path = resolve_path(session.cwd, args.path);
  if (!(await files().get_file(path))) throw new ShellError(`${path}: no such file`);
  kernel.service<AppsService>("apps").launch(APP_ID, { path });
}

export function convert({ args, session }: CommandContext<{ path: string; format: FormatName; quality: number }>): Promise<FileValue> {
  return write_beside(resolve_path(session.cwd, args.path), () => [], FORMATS[args.format], args.quality);
}

export function resize({ args, session }: CommandContext<{ path: string; width: number; height?: number }>): Promise<FileValue> {
  const path = resolve_path(session.cwd, args.path);
  return write_beside(path, (size) => [{ type: OperationType.RESIZE, ...resize_size(size, args.width, args.height) }], own_format(path));
}

export function rotate({ args, session }: CommandContext<{ path: string; degrees: number }>): Promise<FileValue> {
  const path = resolve_path(session.cwd, args.path);
  return write_beside(path, () => [{ type: OperationType.ROTATE, degrees: args.degrees }], own_format(path));
}
