import { describe, expect, it } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import { hue_distance } from "./color";
import { recall_rounds, round_score, ROUNDS, start_guess, total_score } from "./recall";

describe("recall_rounds", () => {
  it("replays the same five colours from a seed", () => {
    expect(recall_rounds(42)).toEqual(recall_rounds(42));
    expect(recall_rounds(42).map((round) => round.hex)).not.toEqual(recall_rounds(43).map((round) => round.hex));
    expect(recall_rounds(42)).toHaveLength(ROUNDS);
  });

  it("keeps targets out of near-grey and near-black", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const { target } of recall_rounds(seed)) {
        expect(target.s).toBeGreaterThanOrEqual(15);
        expect(target.b).toBeGreaterThanOrEqual(15);
        expect(target.h).toBeLessThan(360);
      }
    }
  });
});

describe("start_guess", () => {
  it("starts at least 60° of hue away from the target", () => {
    const rng = create_rng(1);
    for (let hue = 0; hue < 360; hue += 7) {
      const start = start_guess({ h: hue, s: 50, b: 50 }, rng);
      expect(hue_distance(start.h, hue)).toBeGreaterThanOrEqual(60);
      expect(start.h).toBeGreaterThanOrEqual(0);
      expect(start.h).toBeLessThan(360);
    }
  });

  it("starts every round of a puzzle far from its target", () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const { target, start } of recall_rounds(seed)) expect(hue_distance(start.h, target.h)).toBeGreaterThanOrEqual(60);
    }
  });
});

describe("round_score", () => {
  it("gives 10 for a match and falls with the distance", () => {
    expect(round_score("#3366cc", "#3366cc")).toBe(10);
    const near = round_score("#3366cc", "#3a6ad0");
    const far = round_score("#3366cc", "#cc6633");
    expect(near).toBeGreaterThan(9);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it("keeps two decimals at most", () => {
    const score = round_score("#123456", "#654321");
    expect(Math.round(score * 100) / 100).toBe(score);
  });

  it("totals to two decimals", () => {
    expect(total_score([9.115, 8.2, 7.333, 10, 0])).toBe(34.65);
  });
});
