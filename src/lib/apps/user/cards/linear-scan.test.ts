import { describe, expect, test } from "vitest";
import { decode_linear, type Gray } from "$kit/utils/linear-barcode";
import { DETECTOR_FORMATS, CardFormat } from "./formats";
import { barcode_path } from "./render";

// bwip-js (Cards' own encoder) draws the codes, so the hand-written decoder is checked against an independent writer.

interface Look {
  scale?: number;
  blur?: boolean;
  noise?: number;
  shade?: boolean;
  flip?: boolean;
  quiet?: number;
}

function picture(format: CardFormat, code: string, look: Look = {}): Gray {
  const path = barcode_path(format, code);
  const quiet = look.quiet ?? 30;
  const width = path.width + quiet * 2;
  const height = path.height + 20;
  const sharp = new Float32Array(width * height).fill(235);
  for (const [, x, y, w, h] of path.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h/g)) {
    const left = Math.round(Number(x)) + quiet;
    const top = Math.round(Number(y)) + 10;
    for (let row = top; row < top + Number(h); row++) for (let col = left; col < left + Number(w); col++) sharp[row * width + col] = 25;
  }
  const scale = look.scale ?? 1;
  const out_width = Math.round(width * scale);
  const out_height = Math.round(height * scale);
  const data = new Uint8Array(out_width * out_height);
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let y = 0; y < out_height; y++) {
    for (let x = 0; x < out_width; x++) {
      const sx = Math.min(width - 1, (x + 0.5) / scale - 0.5);
      const left = Math.max(0, Math.floor(sx));
      const t = sx - left;
      const sy = Math.min(height - 1, Math.floor(y / scale));
      const at = (col: number) => sharp[sy * width + Math.min(width - 1, Math.max(0, col))];
      const sample = (offset: number) => at(left + offset) * (1 - t) + at(left + offset + 1) * t;
      let value = sample(0);
      if (look.blur) value = (sample(-1) + value * 2 + sample(1)) / 4;
      if (look.shade) value *= 0.45 + 0.55 * (x / out_width);
      if (look.noise) value += random() * look.noise;
      data[y * out_width + (look.flip ? out_width - 1 - x : x)] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  return { data, width: out_width, height: out_height };
}

const SAMPLES: [CardFormat, string, string][] = [
  [CardFormat.EAN_13, "4006381333931", "4006381333931"],
  [CardFormat.UPC_A, "036000291452", "0036000291452"],
  [CardFormat.EAN_8, "96385074", "96385074"],
  [CardFormat.UPC_E, "04252614", "04252614"],
  [CardFormat.CODE_128, "Club-42", "Club-42"],
  [CardFormat.CODE_128, "12345678901234", "12345678901234"],
  [CardFormat.CODE_39, "CARD-39", "CARD-39"],
];

const expected_format = (format: CardFormat) => (format === CardFormat.UPC_A ? CardFormat.EAN_13 : format);

describe("decode_linear reads bwip-js barcodes", () => {
  test.each(SAMPLES)("%s %s, clean", (format, code, value) => {
    expect(decode_linear(picture(format, code), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });

  test.each(SAMPLES)("%s %s, small and noisy", (format, code, value) => {
    expect(decode_linear(picture(format, code, { scale: 0.8, noise: 20 }), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });
  test.each(SAMPLES)("%s %s, soft and noisy", (format, code, value) => {
    expect(decode_linear(picture(format, code, { blur: true, noise: 30 }), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });
  test.each(SAMPLES)("%s %s noisy", (format, code, value) => {
    expect(decode_linear(picture(format, code, { noise: 30 }), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });
  test.each(SAMPLES)("%s %s shade", (format, code, value) => {
    expect(decode_linear(picture(format, code, { shade: true }), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });

  test.each(SAMPLES)("%s %s, upside down under uneven light", (format, code, value) => {
    expect(decode_linear(picture(format, code, { flip: true, shade: true, scale: 1.7 }), DETECTOR_FORMATS)).toEqual({ value, format: expected_format(format) });
  });

  test("UPC-A comes back as UPC-A when EAN-13 isn't asked for", () => {
    expect(decode_linear(picture(CardFormat.UPC_A, "036000291452"), [CardFormat.UPC_A])).toEqual({ value: "036000291452", format: CardFormat.UPC_A });
  });

  test("only the asked formats are read", () => {
    expect(decode_linear(picture(CardFormat.CODE_128, "Club-42"), [CardFormat.EAN_13])).toBeNull();
  });

  test("noise and plain pictures read as nothing", () => {
    let seed = 3;
    const data = new Uint8Array(400 * 300).map(() => ((seed = (seed * 69069 + 1) % 4294967296) >>> 24) & 0xff);
    expect(decode_linear({ data, width: 400, height: 300 }, DETECTOR_FORMATS)).toBeNull();
    expect(decode_linear({ data: new Uint8Array(400 * 300).fill(128), width: 400, height: 300 }, DETECTOR_FORMATS)).toBeNull();
  });
});
