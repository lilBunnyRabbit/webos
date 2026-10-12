/** `BarcodeDetector` isn't in TypeScript's DOM lib yet; this is the slice the apps use. */
interface DetectedBarcode {
  rawValue: string;
}

export interface BarcodeDetector {
  detect(source: QrSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** What gets scanned: a decoded image or a live camera preview. */
export type QrSource = ImageBitmap | HTMLVideoElement;

/** jsQR walks every pixel on the main thread; a camera frame at full resolution stalls the preview. */
const FALLBACK_DECODE_SIZE = 1024;

/** Scales `width` × `height` down (never up) to fit a `max` square, keeping the aspect ratio and at least 1px. */
export function fit_within(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(max / width, max / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function source_size(source: QrSource): { width: number; height: number } {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.width, height: source.height };
}

/**
 * The native `BarcodeDetector` where it reads QR codes, otherwise jsQR behind the same interface.
 * jsQR is imported here, not at the top, so it only ships to browsers that need it (iOS Safari, Firefox).
 */
export async function create_qr_detector(): Promise<BarcodeDetector> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  const formats = await Native?.getSupportedFormats().catch((): string[] => []);
  if (Native && formats?.includes("qr_code")) return new Native({ formats: ["qr_code"] });

  const { default: jsqr } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");

  return {
    async detect(source) {
      const natural = source_size(source);
      if (!natural.width || !natural.height) return [];
      const { width, height } = fit_within(natural.width, natural.height, FALLBACK_DECODE_SIZE);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(source, 0, 0, width, height);
      const code = jsqr(context.getImageData(0, 0, width, height).data, width, height);
      return code ? [{ rawValue: code.data }] : [];
    },
  };
}

export async function detect_qr(detector: BarcodeDetector, source: QrSource): Promise<string | null> {
  const [code] = await detector.detect(source);
  return code?.rawValue ?? null;
}
