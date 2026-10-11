import kernel, { NotificationType, type AppId, type FilesService, type NotificationsService } from "$lib/core/api";
import type { WindowHandle } from "$lib/core/contexts/app";

export const ImageFormat = { PNG: "image/png", JPEG: "image/jpeg", WEBP: "image/webp" } as const;
export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: ImageFormat.PNG, label: "PNG" },
  { value: ImageFormat.JPEG, label: "JPEG" },
  { value: ImageFormat.WEBP, label: "WebP" },
];

const EXTENSIONS: Record<string, ImageFormat> = {
  ".png": ImageFormat.PNG,
  ".jpg": ImageFormat.JPEG,
  ".jpeg": ImageFormat.JPEG,
  ".webp": ImageFormat.WEBP,
};

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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the PNG"))), ImageFormat.PNG);
  });
}

export function parent_folder(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

export function file_stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function extension_for(format: ImageFormat): string {
  return format === ImageFormat.JPEG ? ".jpg" : format === ImageFormat.WEBP ? ".webp" : ".png";
}

/** The format the saved name asks for, so `x.webp` is WebP even if PNG was selected. */
function format_for_name(name: string, fallback: ImageFormat): ImageFormat {
  const dot = name.lastIndexOf(".");
  return (dot > 0 && EXTENSIONS[name.slice(dot).toLowerCase()]) || fallback;
}

export function error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const folder = parent_folder(path);
  const file_name = path.slice(path.lastIndexOf("/") + 1);

  try {
    const files = kernel.service<FilesService>("files");
    const directory = await files.get_directory(folder);
    if (!directory) throw new Error(`Folder not found: ${folder}`);
    const blob = await canvas.convertToBlob({ type: format_for_name(file_name, format), quality: 0.92 });
    await files.create_file(directory, file_name, { content: blob, overwrite: true });
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
