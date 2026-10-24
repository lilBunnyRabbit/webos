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

export const EncoderFormat = {
  ...CodecFormat,
  GIF: "gif",
  BMP: "bmp",
  ICO: "ico",
  TIFF: "tiff",
  QOI: "qoi",
  TGA: "tga",
  PPM: "ppm",
} as const;
export type EncoderFormat = (typeof EncoderFormat)[keyof typeof EncoderFormat];

export interface EncoderInfo {
  format: EncoderFormat;
  label: string;
  mime: string;
  extension: string;
  /** Takes a quality, 1–100. The rest have none: lossless at their bit depth, except GIF, cut to 256 colours. */
  lossy: boolean;
  /** GIF's is one bit: under half opacity is see-through, the rest solid. */
  alpha: boolean;
}

const codec_info = (format: CodecFormat, lossy: boolean): EncoderInfo => {
  const { label, mime, extension } = CODECS[format];
  return { format, label, mime, extension, lossy, alpha: format !== CodecFormat.JPEG };
};

export const ENCODER_INFO: Readonly<Record<EncoderFormat, EncoderInfo>> = {
  png: codec_info(CodecFormat.PNG, false),
  jpeg: codec_info(CodecFormat.JPEG, true),
  webp: codec_info(CodecFormat.WEBP, true),
  avif: codec_info(CodecFormat.AVIF, true),
  jxl: codec_info(CodecFormat.JXL, true),
  gif: { format: "gif", label: "GIF", mime: "image/gif", extension: ".gif", lossy: false, alpha: true },
  bmp: { format: "bmp", label: "BMP", mime: "image/bmp", extension: ".bmp", lossy: false, alpha: true },
  ico: { format: "ico", label: "ICO", mime: "image/x-icon", extension: ".ico", lossy: false, alpha: true },
  tiff: { format: "tiff", label: "TIFF", mime: "image/tiff", extension: ".tiff", lossy: false, alpha: true },
  qoi: { format: "qoi", label: "QOI", mime: "image/qoi", extension: ".qoi", lossy: false, alpha: true },
  tga: { format: "tga", label: "TGA", mime: "image/x-tga", extension: ".tga", lossy: false, alpha: true },
  ppm: { format: "ppm", label: "PPM", mime: "image/x-portable-pixmap", extension: ".ppm", lossy: false, alpha: false },
};

export const ENCODER_FORMATS: readonly EncoderFormat[] = Object.values(EncoderFormat);

export function is_codec_format(format: EncoderFormat): format is CodecFormat {
  return format in CODECS;
}

export function encoder_for_mime(mime: string): EncoderFormat | null {
  const type = mime.toLowerCase();
  if (type === "image/vnd.microsoft.icon") return EncoderFormat.ICO;
  if (type === "image/jpg") return EncoderFormat.JPEG;
  return ENCODER_FORMATS.find((format) => ENCODER_INFO[format].mime === type) ?? null;
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
