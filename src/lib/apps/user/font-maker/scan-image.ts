import type { CharSet } from "./charsets";
import { crop_box, has_ink, homography, to_gray, type Gray, type Quad } from "./scan";
import { template_layout } from "./template";

const MAX_SIDE = 1600;
export const GUIDE_WIDTH = 100;
export const GUIDE_HEIGHT = 120;

export interface ScanImage {
  gray: Gray;
  url: string;
}

export async function load_scan(source: Blob): Promise<ScanImage> {
  const bitmap = await createImageBitmap(source).catch(() => {
    throw new Error("The picture couldn't be read");
  });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, width, height);
    const gray = to_gray(context.getImageData(0, 0, width, height).data, width, height);
    const url = URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }));
    return { gray, url };
  } finally {
    bitmap.close();
  }
}

function data_url(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the guide"));
    reader.readAsDataURL(blob);
  });
}

export async function encode_guide(gray: Gray): Promise<string> {
  const canvas = new OffscreenCanvas(gray.width, gray.height);
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(gray.width, gray.height);
  gray.data.forEach((value, index) => {
    image.data[index * 4] = image.data[index * 4 + 1] = image.data[index * 4 + 2] = value;
    image.data[index * 4 + 3] = 255;
  });
  context.putImageData(image, 0, 0);
  return data_url(await canvas.convertToBlob({ type: "image/webp", quality: 0.6 }));
}

export async function scan_guides(gray: Gray, marks: Quad, set: CharSet): Promise<Map<string, string>> {
  const layout = template_layout(set);
  const page_to_image = homography(layout.marks, marks);
  const guides = new Map<string, string>();
  for (const box of layout.boxes) {
    const crop = crop_box(gray, page_to_image, box, GUIDE_WIDTH, GUIDE_HEIGHT);
    if (has_ink(crop)) guides.set(box.char, await encode_guide(crop));
  }
  return guides;
}
