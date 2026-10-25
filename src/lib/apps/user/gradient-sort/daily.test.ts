import { describe, expect, it } from "vitest";
import { Level, Mode } from "../color-recall/modes";
import { resolve_seed } from "../color-recall/seed";
import { share_head } from "../color-recall/share";
import { sort_share } from "./share";
import { scramble, sort_puzzle, SORT_CONFIGS } from "./sort";

const LINK = "https://example.test/#/solo/gradient-sort?seed=2026-10-29";

// Pinned from Color Games before the split (ADR-071): the same day keeps the same puzzle.
describe("Gradient Sort daily", () => {
  it("plays 2026-10-25 as Color Games › Gradient sort did", () => {
    const seed = resolve_seed(Mode.SORT, "2026-10-25");
    expect(seed).toBe(2410073524);
    const puzzle = sort_puzzle(seed, SORT_CONFIGS[Level.EASY]);
    expect(puzzle.colors.slice(0, 5)).toEqual(["#2e6e1e", "#00684b", "#005f5d", "#005768", "#004c76"]);
    expect(puzzle.colors.at(-1)).toBe("#60e6ba");
    expect(scramble(puzzle, seed)).toEqual([
      0, 13, 2, 19, 4, 1, 17, 23, 7, 15, 10, 8, 16, 18, 14, 9, 3, 5, 11, 22, 20, 12, 6, 27, 24, 25, 26, 21, 28, 29,
    ]);
  });

  it("writes its share line", () => {
    expect(sort_share(share_head("Gradient Sort", "2026-10-29", Level.EASY), 83_000, 41, LINK)).toBe(
      `Gradient Sort #12  1:23 · 41 moves\n${LINK}`
    );
    expect(sort_share("H", 5_000, 1, LINK)).toBe(`H  0:05 · 1 move\n${LINK}`);
  });
});
