import { z } from "zod";

/** `BarcodeDetector` isn't in TypeScript's DOM lib yet; this is the slice the app uses. */
interface DetectedBarcode {
  rawValue: string;
}

export interface BarcodeDetector {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetector;
}

export const QrEntry = z.object({
  id: z.string(),
  content: z.string(),
  image_url: z.string(),
  scanned_at: z.number(),
});
export type QrEntry = z.infer<typeof QrEntry>;

export const QrEntries = z.array(QrEntry);

const THUMBNAIL_SIZE = 200;

export function create_qr_detector(): BarcodeDetector | null {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return Detector ? new Detector({ formats: ["qr_code"] }) : null;
}

export async function detect_qr(detector: BarcodeDetector, source: ImageBitmapSource): Promise<string | null> {
  const [code] = await detector.detect(source);
  return code?.rawValue ?? null;
}

/** A PNG data URL of `source` scaled down to fit a 200px square, small enough to keep in app storage. */
export function thumbnail(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function is_url(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
