import { encode } from "./index";
import { ENCODER_FORMATS, ENCODER_INFO, type EncoderFormat, type EncoderInfo } from "./formats";

export interface EncoderOptions {
  /** 1–100, for the lossy formats; ignored by the rest. */
  quality?: number;
  /** AVIF speed or JPEG XL effort; their defaults otherwise. */
  effort?: number;
  signal?: AbortSignal;
}

export interface Encoder extends EncoderInfo {
  encode(image: ImageData, options?: EncoderOptions): Promise<Blob>;
}

/** Each encode runs in the codec worker pool, so aborting ends it at once, a wasm encode included. */
export const ENCODERS: Readonly<Record<EncoderFormat, Encoder>> = Object.fromEntries(
  ENCODER_FORMATS.map((format) => [
    format,
    {
      ...ENCODER_INFO[format],
      encode: async (image: ImageData, { quality, effort, signal }: EncoderOptions = {}) =>
        (await encode(format, image, { quality, effort }, { signal })).blob,
    },
  ])
) as Record<EncoderFormat, Encoder>;

export { ENCODER_FORMATS, ENCODER_INFO, EncoderFormat, encoder_for_mime, type EncoderInfo } from "./formats";
