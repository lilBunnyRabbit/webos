import { encode } from "uqr";

export type Rgb = [number, number, number];

export interface Ink {
  dark: Rgb;
  light: Rgb;
}

const QUIET_ZONE = 4;

export function frame_modules(version: number): number {
  return 17 + 4 * version + 2 * QUIET_ZONE;
}

// Computed styles come back as `oklch(…)`; painting one pixel turns any CSS colour into RGB.
export function css_rgb(color: string): Rgb {
  const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// Pinned to `version` so the code never changes size under the receiver's camera, the header frame included.
export function frame_bitmap(text: string, version: number, ink: Ink): Promise<ImageBitmap> {
  const { data, size } = encode(text, { ecc: "L", minVersion: version, maxVersion: version, border: QUIET_ZONE });
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = data[y];
    for (let x = 0; x < size; x++) {
      const [r, g, b] = row[x] ? ink.dark : ink.light;
      const at = (y * size + x) * 4;
      pixels[at] = r;
      pixels[at + 1] = g;
      pixels[at + 2] = b;
      pixels[at + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(pixels, size, size));
}
