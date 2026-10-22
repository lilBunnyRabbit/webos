import { rgb_on_white } from "./pixels";
import type { Pixels } from "./ssim";

export function encode_ppm(image: Pixels): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode(`P6\n${image.width} ${image.height}\n255\n`);
  const rgb = rgb_on_white(image);
  const out = new Uint8Array(header.length + rgb.length);
  out.set(header);
  out.set(rgb, header.length);
  return out;
}
