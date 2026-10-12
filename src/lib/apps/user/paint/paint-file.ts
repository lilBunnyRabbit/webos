import kernel, { type FilesService } from "$lib/core/api";
import { ImageFormat, parent_folder } from "$lib/core/utils/image";
import { to_hex } from "./shapes";

const FORMATS: Record<string, ImageFormat> = {
  ".png": ImageFormat.PNG,
  ".jpg": ImageFormat.JPEG,
  ".jpeg": ImageFormat.JPEG,
  ".webp": ImageFormat.WEBP,
};

export function format_for(name: string): ImageFormat {
  const dot = name.lastIndexOf(".");
  return (dot > 0 && FORMATS[name.slice(dot).toLowerCase()]) || ImageFormat.PNG;
}

export function base_name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function encode_canvas(canvas: HTMLCanvasElement, name: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))), format_for(name), 0.92);
  });
}

export async function write_image(path: string, canvas: HTMLCanvasElement): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_folder(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  const name = base_name(path);
  await files.create_file(directory, name, { content: await encode_canvas(canvas, name), overwrite: true });
}

let probe: OffscreenCanvasRenderingContext2D | null = null;

// Theme tokens are OKLCH; the colour input only takes #rrggbb, so let the canvas do the gamut mapping.
export function css_to_hex(color: string): string {
  probe ??= new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  if (!probe) return "#000000";
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return to_hex(r, g, b);
}
