import { describe, expect, it } from "vitest";
import { hex_hints, hex_status, hex_target, HexStatus, Hint, is_hex_digit } from "./hex";

describe("hex guess", () => {
  it("draws a six-digit target from a seed", () => {
    expect(hex_target(3)).toMatch(/^[0-9A-F]{6}$/);
    expect(hex_target(3)).toBe(hex_target(3));
  });

  it("points each digit up, down or right", () => {
    expect(hex_hints("000000", "0A0F09")).toEqual([Hint.EXACT, Hint.UP, Hint.EXACT, Hint.UP, Hint.EXACT, Hint.UP]);
    expect(hex_hints("FFFFFF", "A0F001")).toEqual([Hint.DOWN, Hint.DOWN, Hint.EXACT, Hint.DOWN, Hint.DOWN, Hint.DOWN]);
    expect(hex_hints("B4C2D1", "B4C2D1").every((hint) => hint === Hint.EXACT)).toBe(true);
  });

  it("is won on the target and lost after five misses", () => {
    expect(hex_status([], "ABCDEF")).toBe(HexStatus.PLAYING);
    expect(hex_status(["000000", "ABCDEF"], "ABCDEF")).toBe(HexStatus.WON);
    expect(hex_status(["000000", "111111", "222222", "333333", "444444"], "ABCDEF")).toBe(HexStatus.LOST);
    expect(hex_status(["000000", "111111", "222222", "333333", "ABCDEF"], "ABCDEF")).toBe(HexStatus.WON);
  });

  it("takes hex digits in either case", () => {
    expect(is_hex_digit("a")).toBe(true);
    expect(is_hex_digit("F")).toBe(true);
    expect(is_hex_digit("g")).toBe(false);
    expect(is_hex_digit("Enter")).toBe(false);
  });
});
