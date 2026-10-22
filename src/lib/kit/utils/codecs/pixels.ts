import type { Pixels } from "./ssim";

export function has_alpha(image: Pixels): boolean {
  for (let index = 3; index < image.data.length; index += 4) if (image.data[index] < 255) return true;
  return false;
}

export function rgb_on_white(image: Pixels): Uint8Array {
  const { data } = image;
  const out = new Uint8Array((data.length / 4) * 3);
  for (let source = 0, target = 0; source < data.length; source += 4, target += 3) {
    const alpha = data[source + 3];
    if (alpha === 255) {
      out[target] = data[source];
      out[target + 1] = data[source + 1];
      out[target + 2] = data[source + 2];
    } else {
      const white = 255 - alpha;
      out[target] = Math.round((data[source] * alpha) / 255 + white);
      out[target + 1] = Math.round((data[source + 1] * alpha) / 255 + white);
      out[target + 2] = Math.round((data[source + 2] * alpha) / 255 + white);
    }
  }
  return out;
}

export function concat_bytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
