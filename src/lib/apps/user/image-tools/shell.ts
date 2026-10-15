import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { available_name } from "$lib/core/api/services/files/opfs";
import { parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import {
  ShellError,
  type CommandContext,
  type Completion,
  type ShellService,
  type ShellSession,
} from "$lib/core/api/services/shell/type";
import {
  ImageFormat,
  is_image_file,
  load_image,
  read_pixels,
  write_image,
  type SourceImage,
} from "$lib/core/utils/image";
import { concat_images, type Align, type Direction } from "./join";
import {
  is_image_name,
  joined_name,
  kept_format,
  split_folder_name,
  tile_name,
  transparent_name,
  trimmed_name,
} from "./naming";
import { remove_colours } from "./remove-background";
import { Section } from "./sections";
import { compute_layout, render_tiles, SplitDirection } from "./split";
import { crop, find_crop_bounds } from "./trim";

const APP_ID = "image-tools";

const files = () => kernel.service<FilesService>("files");

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

async function decode(path: string): Promise<SourceImage> {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  try {
    return await load_image(file, path);
  } catch {
    throw new ShellError(`${path}: not an image this browser can read`);
  }
}

async function input_paths(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given;
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(value);
  }
  return paths;
}

async function folder_at(path: string): Promise<FileSystemDirectoryHandle> {
  const directory = await files().get_directory(path);
  if (!directory) throw new ShellError(`${path}: no such folder`);
  return directory;
}

async function written(path: string): Promise<FileValue> {
  const file = await files().get_file(path);
  return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
}

async function write_beside(
  source: string,
  name: string,
  canvas: OffscreenCanvas,
  format: ImageFormat,
  elevated: boolean
): Promise<FileValue> {
  const folder = parent_path(source);
  const target = child_path(folder, await available_name(await folder_at(folder), name));
  assert_writable(target, elevated);
  await write_image(target, canvas, { format });
  return written(target);
}

export async function tools({ args, session }: CommandContext<{ section?: Section; path?: string }>): Promise<void> {
  const path = args.path === undefined ? undefined : resolve_path(session.cwd, args.path);
  if (path !== undefined) {
    const file = await files().get_file(path);
    if (!file) throw new ShellError(`${path}: no such file`);
    if (!is_image_file(file)) throw new ShellError(`${path}: not an image`);
  }
  kernel.service<AppsService>("apps").launch(APP_ID, { section: args.section, path });
}

export async function trim(context: CommandContext<{ paths: string[]; alpha: number }>): Promise<FileValue[]> {
  const { args, session, elevated } = context;
  const typed = await input_paths(args.paths, context);
  if (typed.length === 0) throw new ShellError("trim needs at least one image");
  const out: FileValue[] = [];
  for (const path of typed.map((item) => resolve_path(session.cwd, item))) {
    const image = await decode(path);
    try {
      const cropped = crop(image.bitmap, find_crop_bounds(read_pixels(image.bitmap), args.alpha));
      const { format, extension } = kept_format(image.name, false);
      out.push(await write_beside(path, trimmed_name(image.name, extension), cropped, format, elevated));
    } finally {
      image.bitmap.close();
    }
  }
  return out;
}

export async function split({
  args,
  session,
  elevated,
}: CommandContext<{ path: string; cols?: number; rows?: number }>): Promise<FileValue[]> {
  if ((args.cols === undefined) === (args.rows === undefined))
    throw new ShellError("give --cols or --rows: tiles are square, so the other side follows");
  const path = resolve_path(session.cwd, args.path);
  const image = await decode(path);
  try {
    const layout = compute_layout(image.bitmap.width, image.bitmap.height, {
      direction: args.cols === undefined ? SplitDirection.ROWS : SplitDirection.COLUMNS,
      count: args.cols ?? args.rows ?? 1,
    });
    const folder = parent_path(path);
    assert_writable(child_path(folder, split_folder_name(image.name)), elevated);
    const target = await files().create_directory(await folder_at(folder), split_folder_name(image.name));
    const target_path = child_path(folder, target.name);
    const out: string[] = [];
    for await (const tile of render_tiles(image.bitmap, layout)) {
      const handle = await files().create_file(target, tile_name(image.name, tile.number), { content: tile.blob });
      out.push(child_path(target_path, handle.name));
    }
    return Promise.all(out.map(written));
  } finally {
    image.bitmap.close();
  }
}

export async function join(
  context: CommandContext<{
    paths: string[];
    direction: Direction;
    gap: number;
    align: Align;
    fit: boolean;
    background: string;
    opacity: number;
  }>
): Promise<FileValue> {
  const { args, session, elevated } = context;
  const typed = await input_paths(args.paths, context);
  if (typed.length < 2) throw new ShellError("join needs at least two images");
  const paths = typed.map((item) => resolve_path(session.cwd, item));
  const images: SourceImage[] = [];
  try {
    for (const path of paths) images.push(await decode(path));
    const canvas = concat_images(
      images.map((image) => image.bitmap),
      {
        gap: args.gap,
        align: args.align,
        background: args.background,
        alpha: args.opacity,
        fit: args.fit,
        direction: args.direction,
      }
    );
    if (!canvas) throw new ShellError("nothing to join");
    return await write_beside(paths[0], joined_name(".png"), canvas, ImageFormat.PNG, elevated);
  } finally {
    for (const image of images) image.bitmap.close();
  }
}

export async function unbg({
  args,
  session,
  elevated,
}: CommandContext<{ path: string; color: string[] }>): Promise<FileValue> {
  const path = resolve_path(session.cwd, args.path);
  const image = await decode(path);
  try {
    const { format, extension } = kept_format(image.name, true);
    const result = remove_colours(image.bitmap, args.color);
    return await write_beside(path, transparent_name(image.name, extension), result, format, elevated);
  } finally {
    image.bitmap.close();
  }
}

export async function complete_images(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || is_image_name(item.value));
}
