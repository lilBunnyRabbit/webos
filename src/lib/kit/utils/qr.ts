import { encode } from "uqr";

/** `BarcodeDetector` isn't in TypeScript's DOM lib yet; this is the slice the apps use. */
interface DetectedBarcode {
  rawValue: string;
  /** The `BarcodeDetector` format name: `qr_code`, `ean_13`, `code_128`… */
  format: string;
}

export interface BarcodeDetector {
  detect(source: QrSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** A code read from an image or a frame, with the format it was written in. */
export interface DetectedCode {
  value: string;
  format: string;
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
 * The native `BarcodeDetector` for the `formats` it reads (its names: `qr_code`, `ean_13`, …), otherwise jsQR behind
 * the same interface, which reads QR codes only. A format the platform lacks is left out rather than dropping to jsQR:
 * macOS reads UPC-A as EAN-13 and lists no `upc_a`. jsQR is imported here, not at the top, so it only ships to
 * browsers that need it (iOS Safari, Firefox).
 */
export async function create_barcode_detector(formats: string[]): Promise<BarcodeDetector> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  const supported = (await Native?.getSupportedFormats().catch((): string[] => [])) ?? [];
  const usable = formats.filter((format) => supported.includes(format));
  if (Native && usable.length > 0) return new Native({ formats: usable });

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
      return code ? [{ rawValue: code.data, format: "qr_code" }] : [];
    },
  };
}

/** `create_barcode_detector(["qr_code"])`. */
export function create_qr_detector(): Promise<BarcodeDetector> {
  return create_barcode_detector(["qr_code"]);
}

/** The first code `detector` finds in `source`, with its format. */
export async function detect_barcode(detector: BarcodeDetector, source: QrSource): Promise<DetectedCode | null> {
  const [code] = await detector.detect(source);
  return code ? { value: code.rawValue, format: code.format } : null;
}

export async function detect_qr(detector: BarcodeDetector, source: QrSource): Promise<string | null> {
  return (await detect_barcode(detector, source))?.value ?? null;
}

export interface QrPath {
  /** Modules per side, quiet zone included. */
  size: number;
  /** One SVG path of every dark module, in module units: `<svg viewBox="0 0 {size} {size}"><path d={d} />`. */
  d: string;
}

/** Encodes `text` as a QR code drawn as a single SVG path, with the 4-module quiet zone the spec asks for. */
export function qr_path(text: string): QrPath {
  const { data, size } = encode(text, { ecc: "L", border: 4 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    })
  );
  return { size, d };
}
