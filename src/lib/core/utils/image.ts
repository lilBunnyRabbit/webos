import kernel, { NotificationType, type AppId, type FilesService, type NotificationsService } from "$lib/core/api";
import type { WindowHandle } from "$lib/core/contexts/app";
import { DEFAULT_QUALITY, format_for_name, needs_backdrop, type ImageFormat } from "./image-format";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { error_message } from "./utils";

export * from "./image-format";

export interface SourceImage {
  name: string;
  /** OPFS path when the image came from the file system; `null` for dropped or pasted images. */
  path: string | null;
  type: string;
  size: number;
  bitmap: ImageBitmap;
}

type Drawable = CanvasImageSource & { width: number; height: number };

export function is_image_file(file: File): boolean {
  return file.type.startsWith("image/");
}

export async function load_image(file: File, path: string | null = null): Promise<SourceImage> {
  if (!is_image_file(file)) throw new Error(`${file.name} is not an image`);
  // Decoded through <img> rather than createImageBitmap(blob), which rejects SVG.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const bitmap = await createImageBitmap(image);
    return { name: file.name, path, type: file.type, size: file.size, bitmap };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function load_image_at(path: string): Promise<SourceImage> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return load_image(file, path);
}

/** Image files from a drop or paste; everything else is ignored. */
export function image_files(transfer: DataTransfer | null | undefined): File[] {
  return Array.from(transfer?.files ?? []).filter(is_image_file);
}

/** Only drags from the host OS carry `Files`; drags inside the page are left alone. */
export function has_files(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

export function read_pixels(source: Drawable): ImageData {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  return context.getImageData(0, 0, source.width, source.height);
}

/** Attachment that paints `source` onto a canvas at its natural size; CSS scales it. */
export function paint(source: Drawable) {
  return (canvas: HTMLCanvasElement) => {
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
  };
}

export function canvas_to_blob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the PNG"))), "image/png");
  });
}

export interface WriteImageOptions {
  /** Defaults to the path's extension, then PNG. */
  format?: ImageFormat;
  quality?: number;
}

export async function encode_image(
  source: HTMLCanvasElement | OffscreenCanvas,
  format: ImageFormat,
  quality: number = DEFAULT_QUALITY
): Promise<Blob> {
  let canvas = source;
  if (needs_backdrop(format)) {
    canvas = new OffscreenCanvas(source.width, source.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
  }
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: format, quality });
  const element = canvas;
  return new Promise((resolve, reject) => {
    element.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))), format, quality);
  });
}

/** Writes to `path`, replacing any file there. A canvas is encoded first; a Blob is written as is. */
export async function write_image(
  path: string,
  source: HTMLCanvasElement | OffscreenCanvas | Blob,
  { format, quality }: WriteImageOptions = {}
): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  const name = base_name(path);
  const content =
    source instanceof Blob ? source : await encode_image(source, format ?? format_for_name(name), quality);
  await files.create_file(directory, name, { content, overwrite: true });
}

export interface SaveImageOptions {
  app_id: AppId;
  window: WindowHandle;
  canvas: OffscreenCanvas;
  name: string;
  format: ImageFormat;
  start_path?: string | null;
}

/** Asks where to save with the save picker, then writes the encoded canvas there through FilesService. */
export async function save_image({
  app_id,
  window,
  canvas,
  name,
  format,
  start_path,
}: SaveImageOptions): Promise<void> {
  const path = await window.pick_save({ name, accept: ["image/*"], start_path: start_path ?? "/home" });
  if (!path) return;

  const notifications = kernel.service<NotificationsService>("notifications");
  const file_name = base_name(path);

  try {
    await write_image(path, canvas, { format: format_for_name(file_name, format) });
    notifications.notify(app_id, { title: "Image saved", message: path });
  } catch (error) {
    console.error(`[${app_id}] Couldn't save the image`, error);
    notifications.notify(app_id, {
      type: NotificationType.ERROR,
      title: "Couldn't save the image",
      message: error_message(error),
    });
  }
}
