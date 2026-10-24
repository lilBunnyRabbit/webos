import { has_alpha } from "./pixels";
import type { Pixels } from "./ssim";

const OP_INDEX = 0x00;
const OP_DIFF = 0x40;
const OP_LUMA = 0x80;
const OP_RUN = 0xc0;
const OP_RGB = 0xfe;
const OP_RGBA = 0xff;
const HEADER = 14;
const END = [0, 0, 0, 0, 0, 0, 0, 1];
const MAX_RUN = 62;

export const qoi_hash = (r: number, g: number, b: number, a: number) => (r * 3 + g * 5 + b * 7 + a * 11) % 64;

export function encode_qoi(image: Pixels): Uint8Array<ArrayBuffer> {
  const { width, height, data } = image;
  const channels = has_alpha(image) ? 4 : 3;
  const worst = HEADER + width * height * (channels + 1) + END.length;
  const out = new Uint8Array(worst);
  const view = new DataView(out.buffer);
  out.set([0x71, 0x6f, 0x69, 0x66], 0);
  view.setUint32(4, width);
  view.setUint32(8, height);
  out[12] = channels;
  out[13] = 0;

  const seen = new Uint8Array(64 * 4);
  let at = HEADER;
  let run = 0;
  let pr = 0;
  let pg = 0;
  let pb = 0;
  let pa = 255;
  const last = data.length - 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (r === pr && g === pg && b === pb && a === pa) {
      run++;
      if (run === MAX_RUN || i === last) {
        out[at++] = OP_RUN | (run - 1);
        run = 0;
      }
      continue;
    }
    if (run > 0) {
      out[at++] = OP_RUN | (run - 1);
      run = 0;
    }
    const hash = qoi_hash(r, g, b, a);
    const slot = hash * 4;
    if (seen[slot] === r && seen[slot + 1] === g && seen[slot + 2] === b && seen[slot + 3] === a) {
      out[at++] = OP_INDEX | hash;
    } else {
      seen[slot] = r;
      seen[slot + 1] = g;
      seen[slot + 2] = b;
      seen[slot + 3] = a;
      if (a === pa) {
        const dr = ((r - pr + 384) % 256) - 128;
        const dg = ((g - pg + 384) % 256) - 128;
        const db = ((b - pb + 384) % 256) - 128;
        const dr_dg = dr - dg;
        const db_dg = db - dg;
        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) {
          out[at++] = OP_DIFF | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
        } else if (dg > -33 && dg < 32 && dr_dg > -9 && dr_dg < 8 && db_dg > -9 && db_dg < 8) {
          out[at++] = OP_LUMA | (dg + 32);
          out[at++] = ((dr_dg + 8) << 4) | (db_dg + 8);
        } else {
          out[at++] = OP_RGB;
          out[at++] = r;
          out[at++] = g;
          out[at++] = b;
        }
      } else {
        out[at++] = OP_RGBA;
        out[at++] = r;
        out[at++] = g;
        out[at++] = b;
        out[at++] = a;
      }
    }
    pr = r;
    pg = g;
    pb = b;
    pa = a;
  }
  out.set(END, at);
  return out.slice(0, at + END.length);
}
