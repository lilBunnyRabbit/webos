export const CodecFormat = { JPEG: "jpeg", WEBP: "webp", AVIF: "avif", JXL: "jxl", PNG: "png" } as const;
export type CodecFormat = (typeof CodecFormat)[keyof typeof CodecFormat];

export const CODEC_FORMATS: readonly CodecFormat[] = Object.values(CodecFormat);

export interface EncodeOptions {
  quality?: number;
  effort?: number;
  lossless?: boolean;
}

export interface EffortRange {
  label: string;
  min: number;
  max: number;
  default: number;
  /** AVIF counts speed, so its higher values are faster and larger. */
  slower_up: boolean;
}

export interface CodecInfo {
  format: CodecFormat;
  label: string;
  mime: string;
  extension: string;
  wasm: boolean;
  quality: number | null;
  effort: EffortRange | null;
  lossless: boolean;
}

export const CODECS: Readonly<Record<CodecFormat, CodecInfo>> = {
  jpeg: { format: "jpeg", label: "JPEG", mime: "image/jpeg", extension: ".jpg", wasm: false, quality: 82, effort: null, lossless: false },
  // Chromium's canvas encoder writes lossless WebP at quality 1.
  webp: { format: "webp", label: "WebP", mime: "image/webp", extension: ".webp", wasm: false, quality: 80, effort: null, lossless: true },
  avif: {
    format: "avif",
    label: "AVIF",
    mime: "image/avif",
    extension: ".avif",
    wasm: true,
    quality: 60,
    effort: { label: "Speed", min: 0, max: 10, default: 6, slower_up: false },
    lossless: true,
  },
  jxl: {
    format: "jxl",
    label: "JPEG XL",
    mime: "image/jxl",
    extension: ".jxl",
    wasm: true,
    quality: 75,
    effort: { label: "Effort", min: 1, max: 9, default: 7, slower_up: true },
    lossless: true,
  },
  png: { format: "png", label: "PNG", mime: "image/png", extension: ".png", wasm: false, quality: null, effort: null, lossless: true },
};

export function default_options(format: CodecFormat): Required<EncodeOptions> {
  const info = CODECS[format];
  return { quality: info.quality ?? 100, effort: info.effort?.default ?? 0, lossless: format === CodecFormat.PNG };
}

const JXL_CODESTREAM = [0xff, 0x0a];
const JXL_CONTAINER = [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a];

const starts_with = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** By signature, so a `.jxl` the browser gives no MIME type still counts. */
export function is_jxl(head: Uint8Array): boolean {
  return starts_with(head, JXL_CODESTREAM) || starts_with(head, JXL_CONTAINER);
}

export function is_avif(head: Uint8Array): boolean {
  if (head.length < 12 || String.fromCharCode(...head.subarray(4, 8)) !== "ftyp") return false;
  const brand = String.fromCharCode(...head.subarray(8, 12));
  return brand === "avif" || brand === "avis";
}

export function format_for_name(name: string): CodecFormat | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = name.slice(dot).toLowerCase();
  if (extension === ".jpeg") return CodecFormat.JPEG;
  return CODEC_FORMATS.find((format) => CODECS[format].extension === extension) ?? null;
}
