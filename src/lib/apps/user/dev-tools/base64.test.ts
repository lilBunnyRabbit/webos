import { describe, expect, test } from "vitest";
import { decode_base64, encode_base64 } from "./base64";

describe("encode_base64", () => {
  test("encodes ASCII like btoa", () => {
    expect(encode_base64("hello")).toBe("aGVsbG8=");
  });

  test("encodes UTF-8, not Latin-1", () => {
    expect(encode_base64("č")).toBe("xI0=");
  });

  test("url-safe swaps the alphabet and drops padding", () => {
    expect(encode_base64("??>")).toBe("Pz8+");
    expect(encode_base64("??>", true)).toBe("Pz8-");
    expect(encode_base64("???", false)).toBe("Pz8/");
    expect(encode_base64("???", true)).toBe("Pz8_");
    expect(encode_base64("a", true)).toBe("YQ");
  });
});

describe("decode_base64", () => {
  const samples = ["", "hello", "Žabe in čevapčiči", "emoji 🐰 and 中文", "a\nb\tc"];

  test.each(samples)("round trips %j through both alphabets", (text) => {
    expect(decode_base64(encode_base64(text))).toEqual({ ok: true, value: text });
    expect(decode_base64(encode_base64(text, true))).toEqual({ ok: true, value: text });
  });

  test("ignores whitespace and missing padding", () => {
    expect(decode_base64("aGVs\nbG8")).toEqual({ ok: true, value: "hello" });
  });

  test("rejects characters outside the alphabet", () => {
    expect(decode_base64("a*b=").ok).toBe(false);
  });

  test("rejects an impossible length", () => {
    expect(decode_base64("aGVsb").ok).toBe(false);
  });

  test("rejects bytes that aren't UTF-8", () => {
    const result = decode_base64("/w==");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UTF-8/);
  });
});
