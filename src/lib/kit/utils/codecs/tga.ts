import { has_alpha } from "./pixels";
import type { Pixels } from "./ssim";

const HEADER = 18;
const FOOTER = "\0\0\0\0\0\0\0\0TRUEVISION-XFILE.\0";
const TOP_LEFT = 0x20;
export const TGA_MAX_SIDE = 0xffff;

export function encode_tga(image: Pixels): Uint8Array<ArrayBuffer> {
  const { width, height, data } = image;
  if (width > TGA_MAX_SIDE || height > TGA_MAX_SIDE) throw new Error(`A TGA can't be wider or taller than ${TGA_MAX_SIDE} px`);
  const alpha = has_alpha(image);
  const bytes = alpha ? 4 : 3;
  const out = new Uint8Array(HEADER + width * height * bytes + FOOTER.length);
  const view = new DataView(out.buffer);
  out[2] = 2;
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  out[16] = bytes * 8;
  out[17] = TOP_LEFT | (alpha ? 8 : 0);
  let at = HEADER;
  for (let i = 0; i < data.length; i += 4) {
    out[at++] = data[i + 2];
    out[at++] = data[i + 1];
    out[at++] = data[i];
    if (alpha) out[at++] = data[i + 3];
  }
  for (let i = 0; i < FOOTER.length; i++) out[at + i] = FOOTER.charCodeAt(i);
  return out;
}
