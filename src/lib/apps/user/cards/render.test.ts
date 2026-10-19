import { describe, expect, test } from "vitest";
import { CardFormat } from "./formats";
import { barcode_path, render_error } from "./render";

const SAMPLES: Record<Exclude<CardFormat, "none">, string> = {
  ean_13: "4006381333931",
  ean_8: "96385074",
  upc_a: "036000291452",
  upc_e: "04252614",
  code_128: "Club-42",
  code_39: "CARD-39",
  code_93: "CARD 93",
  itf: "12345678",
  codabar: "A40156B",
  qr_code: "https://example.com/card/1",
  pdf417: "PDF417 card",
  aztec: "Aztec card",
  data_matrix: "DM 0042",
};

describe("barcode_path", () => {
  test.each(Object.entries(SAMPLES))("%s draws a path", (format, code) => {
    const path = barcode_path(format as CardFormat, code);
    expect(path.width).toBeGreaterThan(0);
    expect(path.height).toBeGreaterThan(0);
    expect(path.d).toMatch(/^M/);
  });

  test("EAN-13 is 30 bars", () => {
    const { d, height, width } = barcode_path(CardFormat.EAN_13, SAMPLES.ean_13);
    expect(d.match(/M/g)).toHaveLength(30);
    expect(width).toBeGreaterThan(height);
  });

  test("2D codes are square", () => {
    const { width, height } = barcode_path(CardFormat.QR, SAMPLES.qr_code);
    expect(width).toBe(height);
  });

  test("number only has no barcode", () => {
    expect(() => barcode_path(CardFormat.NONE, "123")).toThrow("Number only has no barcode");
  });

  test("a bad code throws bwip-js's reason without its prefix", () => {
    let message = "";
    try {
      barcode_path(CardFormat.EAN_13, "4006381333932");
    } catch (error) {
      message = render_error(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toMatch(/^bwip/);
  });
});
