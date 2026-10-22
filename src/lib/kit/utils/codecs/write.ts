import { encode_bmp } from "./bmp";
import type { CodecFormat, EncoderFormat } from "./formats";
import { encode_gif_image } from "./gif";
import { encode_ico_image } from "./ico";
import { encode_ppm } from "./ppm";
import { encode_qoi } from "./qoi";
import { encode_tga } from "./tga";
import { encode_tiff } from "./tiff";

export type WrittenFormat = Exclude<EncoderFormat, CodecFormat>;

const WRITERS: Record<WrittenFormat, (image: ImageData) => Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>>> = {
  gif: encode_gif_image,
  bmp: encode_bmp,
  ico: encode_ico_image,
  tiff: encode_tiff,
  qoi: encode_qoi,
  tga: encode_tga,
  ppm: encode_ppm,
};

export function write_pixels(format: WrittenFormat, image: ImageData): Promise<Uint8Array<ArrayBuffer>> {
  return Promise.resolve(WRITERS[format](image));
}
