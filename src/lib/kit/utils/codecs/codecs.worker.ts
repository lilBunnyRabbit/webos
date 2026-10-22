import { CODECS, CodecFormat, ENCODER_INFO, is_avif, is_codec_format, is_jxl, type EncodeOptions, type EncoderFormat } from "./formats";
import { ssim, type SsimResult } from "./ssim";

export type CodecRequest =
  | { id: number; op: "encode"; format: EncoderFormat; image: ImageData; options: EncodeOptions }
  | { id: number; op: "decode"; blob: Blob }
  | { id: number; op: "compare"; a: ImageData; b: ImageData };

export interface EncodeResult {
  blob: Blob;
  /** The codec's own time, without queueing or copying the pixels across. */
  ms: number;
}

export type CodecResponse =
  | { id: number; ok: true; result: EncodeResult | ImageData | SsimResult }
  | { id: number; ok: false; error: string };

const clamp_quality = (quality: number | undefined, fallback: number) => Math.min(100, Math.max(1, Math.round(quality ?? fallback)));

async function encode_native(format: CodecFormat, image: ImageData, options: EncodeOptions): Promise<Blob> {
  const info = CODECS[format];
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d")!;
  if (format === CodecFormat.JPEG) {
    const bitmap = await createImageBitmap(image);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    context.putImageData(image, 0, 0);
  }
  const quality = options.lossless ? 1 : clamp_quality(options.quality, info.quality ?? 100) / 100;
  const blob = await canvas.convertToBlob({ type: info.mime, quality });
  if (blob.type !== info.mime) throw new Error(`This browser can't encode ${info.label}`);
  return blob;
}

async function encode(format: EncoderFormat, image: ImageData, options: EncodeOptions): Promise<Blob> {
  if (!is_codec_format(format)) {
    const { write_pixels } = await import("./write");
    return new Blob([await write_pixels(format, image)], { type: ENCODER_INFO[format].mime });
  }
  const info = CODECS[format];
  const quality = clamp_quality(options.quality, info.quality ?? 100);
  const lossless = options.lossless ?? false;
  if (format === CodecFormat.AVIF) {
    const { default: encode_avif } = await import("@jsquash/avif/encode.js");
    const speed = Math.round(options.effort ?? info.effort!.default);
    return new Blob([await encode_avif(image, { quality, speed, lossless })], { type: info.mime });
  }
  if (format === CodecFormat.JXL) {
    const { default: encode_jxl } = await import("@jsquash/jxl/encode.js");
    const effort = Math.round(options.effort ?? info.effort!.default);
    return new Blob([await encode_jxl(image, { quality, effort, lossless })], { type: info.mime });
  }
  return encode_native(format, image, options);
}

function read_bitmap(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function decode(blob: Blob): Promise<ImageData> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (is_jxl(head)) {
    const { default: decode_jxl } = await import("@jsquash/jxl/decode.js");
    return decode_jxl(await blob.arrayBuffer());
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
  } catch (error) {
    if (!is_avif(head)) throw new Error("Not an image this browser can read", { cause: error });
    const { default: decode_avif } = await import("@jsquash/avif/decode.js");
    const image = await decode_avif(await blob.arrayBuffer());
    if (!image) throw new Error("Couldn't decode the AVIF");
    return image;
  }
  try {
    return read_bitmap(bitmap);
  } finally {
    bitmap.close();
  }
}

async function handle(request: CodecRequest): Promise<{ result: EncodeResult | ImageData | SsimResult; transfer: Transferable[] }> {
  if (request.op === "encode") {
    const start = performance.now();
    const blob = await encode(request.format, request.image, request.options);
    return { result: { blob, ms: performance.now() - start }, transfer: [] };
  }
  if (request.op === "decode") {
    const image = await decode(request.blob);
    return { result: image, transfer: [image.data.buffer] };
  }
  const result = ssim(request.a, request.b);
  return { result, transfer: [result.map.buffer] };
}

self.onmessage = async ({ data: request }: MessageEvent<CodecRequest>) => {
  try {
    const { result, transfer } = await handle(request);
    self.postMessage({ id: request.id, ok: true, result } satisfies CodecResponse, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id: request.id, ok: false, error: message } satisfies CodecResponse);
  }
};
