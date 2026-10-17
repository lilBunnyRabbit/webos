import jsqr from "jsqr";
import { encode as uqr } from "uqr";
import { describe, expect, test } from "vitest";
import { create_rng, pick, random_int, type Rng } from "$lib/core/utils/random";
import { CapacityError, encode, Segmentation, type EncodeOptions, type QrCode } from "./encode";
import { format_bits, version_bits } from "./matrix";
import { generator, remainder } from "./reed-solomon";
import { Charset, encode_latin2, Mode, optimal_segments, segment_bits, single_segments } from "./segments";
import { alignment_positions, data_codewords, Ecc, ECC_LEVELS, MAX_VERSION, raw_data_modules } from "./tables";

const ALPHABETS = [
  "0123456789",
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:",
  "abcdefghijklmnopqrstuvwxyz ABCXYZ0123456789!?.,:/-_=&#@",
  "čšžćđČŠŽĆĐ äöüß éèê ñ",
  "日本語のテキスト 漢字",
  "🙂🐇✨ ",
];

function random_text(rng: Rng, length: number): string {
  const alphabet = [...pick(ALPHABETS, rng)];
  return Array.from({ length }, () => pick(alphabet, rng)).join("");
}

function rows(code: QrCode): boolean[][] {
  return Array.from({ length: code.size }, (_, y) => Array.from({ length: code.size }, (_, x) => code.modules[y * code.size + x] === 1));
}

function reference(text: string, options: EncodeOptions) {
  return uqr(text, {
    ecc: options.ecc,
    border: 0,
    minVersion: options.min_version,
    maxVersion: options.max_version,
    maskPattern: options.mask ?? -1,
    boostEcc: options.boost_ecc,
  });
}

function scan(code: QrCode) {
  const scale = 4;
  const side = (code.size + 8) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < code.size; y++)
    for (let x = 0; x < code.size; x++) {
      if (!code.modules[y * code.size + x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * side + (x + 4) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }
  return jsqr(pixels, side, side);
}

function decode(code: QrCode): string | null {
  return scan(code)?.data ?? null;
}

describe("matches uqr module for module", () => {
  const rng = create_rng(20261017);
  const cases: { text: string; options: EncodeOptions }[] = [];
  for (let i = 0; i < 320; i++) {
    const length = pick([0, 1, 2, 5, 17, 40, 100, 300, 800, 1400], rng);
    cases.push({
      text: random_text(rng, random_int(Math.max(0, length - 3), length, rng)),
      options: {
        ecc: pick(ECC_LEVELS, rng),
        min_version: rng() < 0.2 ? random_int(1, 20, rng) : undefined,
        mask: rng() < 0.25 ? random_int(0, 7, rng) : null,
        boost_ecc: rng() < 0.2,
      },
    });
  }
  for (let version = 1; version <= MAX_VERSION; version++) cases.push({ text: "QR", options: { ecc: ECC_LEVELS[version % 4], min_version: version } });

  test.each(cases.map((item, i) => [i, item] as const))("case %i", (_, { text, options }) => {
    let expected: ReturnType<typeof uqr>;
    try {
      expected = reference(text, options);
    } catch {
      expect(() => encode(text, { ...options, segmentation: Segmentation.SINGLE })).toThrow(CapacityError);
      return;
    }
    const code = encode(text, { ...options, segmentation: Segmentation.SINGLE });
    expect(code.version).toBe(expected.version);
    expect(code.mask).toBe(expected.maskPattern);
    expect(rows(code)).toEqual(expected.data);
  });
});

describe("known values", () => {
  test("format bits for ECC M, mask 0 and ECC L, mask 4", () => {
    expect(format_bits(Ecc.M, 0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(format_bits(Ecc.L, 4).toString(2).padStart(15, "0")).toBe("110011000101111");
  });

  test("version 7 information", () => {
    expect(version_bits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });

  test("alignment centres", () => {
    expect(alignment_positions(1)).toEqual([]);
    expect(alignment_positions(2)).toEqual([6, 18]);
    expect(alignment_positions(7)).toEqual([6, 22, 38]);
    expect(alignment_positions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignment_positions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  test("capacities", () => {
    expect(raw_data_modules(1)).toBe(208);
    expect(data_codewords(1, Ecc.L)).toBe(19);
    expect(data_codewords(40, Ecc.L)).toBe(2956);
    expect(data_codewords(40, Ecc.H)).toBe(1276);
  });

  test("Reed–Solomon of the spec's 1-M example", () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(remainder(data, generator(10))).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  test("01234567 at 1-M encodes to the spec's data codewords", () => {
    const code = encode("01234567", { ecc: Ecc.M, segmentation: Segmentation.SINGLE });
    expect(code.version).toBe(1);
    expect(code.data_codewords).toEqual([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
  });

  test("HELLO WORLD at 1-M", () => {
    const code = encode("HELLO WORLD", { ecc: Ecc.M, segmentation: Segmentation.SINGLE });
    expect(code.data_codewords).toEqual([0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
    expect(code.blocks[0].ecc).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  test("too much data", () => {
    expect(() => encode("9".repeat(7090), { ecc: Ecc.L })).toThrow(CapacityError);
    expect(encode("9".repeat(7089), { ecc: Ecc.L }).version).toBe(40);
  });
});

describe("optimal segments", () => {
  test("mixes modes where it pays", () => {
    const segments = optimal_segments("https://example.com/ABCDEFGHIJ0123456789012345", 5);
    expect(segments.map((segment) => segment.mode)).toEqual([Mode.BYTE, Mode.ALPHANUMERIC, Mode.NUMERIC]);
  });

  test("never costs more than one segment", () => {
    const rng = create_rng(7);
    for (let i = 0; i < 200; i++) {
      const text = random_text(rng, random_int(1, 120, rng)) + random_text(rng, random_int(0, 40, rng));
      for (const version of [1, 10, 27]) expect(segment_bits(optimal_segments(text, version), version)).toBeLessThanOrEqual(segment_bits(single_segments(text), version));
    }
  });

  test("decodes back", () => {
    const rng = create_rng(11);
    for (let i = 0; i < 40; i++) {
      const text = random_text(rng, random_int(1, 60, rng)) + random_text(rng, random_int(1, 60, rng));
      expect(decode(encode(text, { ecc: pick(ECC_LEVELS, rng) }))).toBe(text);
    }
  });
});

test("ISO 8859-2 with an ECI header decodes", () => {
  const code = encode("Plačilo za šolo, Žiri", { ecc: Ecc.M, charset: Charset.LATIN2 });
  expect(code.segments.map((segment) => segment.mode)).toEqual([Mode.ECI, Mode.BYTE]);
  expect(code.parts[0].bits.join("")).toBe("0111");
  expect(code.parts[1].bits.join("")).toBe("00000100");
  expect(scan(code)?.chunks.map((chunk) => chunk.type)).toEqual(["eci", "byte"]);
  expect(scan(code)?.binaryData).toEqual([...encode_latin2("Plačilo za šolo, Žiri")]);
});
