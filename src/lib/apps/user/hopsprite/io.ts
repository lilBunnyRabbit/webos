import kernel, { type FilesService } from "$lib/core/api";
import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
import { load_image, read_pixels } from "$lib/core/utils/image";
import { set_cel, set_durations, insert_frame } from "./document";
import { EXTENSION, parse_sprite } from "./format";
import { create_sprite, MAX_FRAMES, MAX_SIDE, TRANSPARENT_HEX, type Sprite } from "./model";
import { index_pixels } from "./quantize";

export interface Opened {
  sprite: Sprite;
  imported: boolean;
  approximated: number;
}

export function is_sprite_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function sprite_name_for(name: string): string {
  return is_sprite_name(name) ? name : `${file_stem(name) || "Untitled"}${EXTENSION}`;
}

function is_gif(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

function check_size(width: number, height: number): void {
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new Error(`${width}×${height} is too big for a sprite; the limit is ${MAX_SIDE}×${MAX_SIDE}`);
  }
}

interface RgbaFrame {
  rgba: Uint8ClampedArray;
  duration: number;
}

async function decode_gif(file: File): Promise<{ width: number; height: number; frames: RgbaFrame[] }> {
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const frames: RgbaFrame[] = [];
    let canvas: OffscreenCanvas | null = null;
    for (let index = 0; index < count; index++) {
      const { image } = await decoder.decode({ frameIndex: index });
      try {
        canvas ??= new OffscreenCanvas(image.displayWidth, image.displayHeight);
        check_size(canvas.width, canvas.height);
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        const duration = (image.duration ?? 0) / 1000;
        frames.push({ rgba: context.getImageData(0, 0, canvas.width, canvas.height).data, duration: duration > 0 ? duration : 100 });
      } finally {
        image.close();
      }
    }
    if (!canvas) throw new Error("The GIF has no frames");
    return { width: canvas.width, height: canvas.height, frames };
  } finally {
    decoder.close();
  }
}

export function sprite_from_frames(width: number, height: number, frames: readonly RgbaFrame[]): { sprite: Sprite; approximated: number } {
  let sprite = create_sprite(width, height, []);
  let palette: string[] = [TRANSPARENT_HEX];
  let approximated = 0;
  const layer = sprite.layers[0].id;
  frames.forEach((frame, index) => {
    if (index > 0) sprite = insert_frame(sprite, index - 1, false);
    const indexed = index_pixels(frame.rgba, palette);
    palette = indexed.palette;
    approximated += indexed.approximated;
    sprite = set_durations(sprite, [index], frame.duration);
    sprite = set_cel({ ...sprite, palette }, layer, sprite.frames[index].id, indexed.data);
  });
  return { sprite: { ...sprite, palette }, approximated };
}

export async function read_file(file: File): Promise<Opened> {
  if (is_sprite_name(file.name)) return { sprite: parse_sprite(await file.text()), imported: false, approximated: 0 };
  if (is_gif(file)) {
    const { width, height, frames } = await decode_gif(file);
    return { ...sprite_from_frames(width, height, frames), imported: true };
  }
  const image = await load_image(file);
  try {
    check_size(image.bitmap.width, image.bitmap.height);
    const pixels = read_pixels(image.bitmap);
    return { ...sprite_from_frames(pixels.width, pixels.height, [{ rgba: pixels.data, duration: 100 }]), imported: true };
  } finally {
    image.bitmap.close();
  }
}

export async function read_path(path: string): Promise<Opened> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return read_file(file);
}

export async function write_text(path: string, content: string | Blob): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  await files.create_file(directory, base_name(path), { content, overwrite: true });
}
