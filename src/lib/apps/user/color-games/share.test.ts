import { describe, expect, it } from "vitest";
import { Hint } from "./hex";
import { Level, Mode } from "./modes";
import { puzzle_number } from "./seed";
import { band, challenge_props, hex_share, odd_share, recall_share, share_head, sort_share } from "./share";

const LINK = "https://example.test/#/solo/color-games?mode=recall&seed=2026-10-29";

describe("share", () => {
  it("numbers the daily from launch day", () => {
    expect(puzzle_number("2026-10-18")).toBe(1);
    expect(puzzle_number("2026-10-29")).toBe(12);
    expect(puzzle_number("2027-01-01")).toBe(76);
  });

  it("bands a round", () => {
    expect([9.5, 9, 8.99, 7, 6.5, 4, 3.99, 0].map(band).join("")).toBe("🟩🟩🟨🟨🟧🟧🟥🟥");
  });

  it("heads a daily with its number and practice with its level", () => {
    expect(share_head(Mode.RECALL, "2026-10-29", Level.EASY)).toBe("Color Games · Recall #12");
    expect(share_head(Mode.SORT, 123, Level.HARD)).toBe("Color Games · Gradient sort · Practice (Hard)");
    expect(share_head(Mode.ODD, 123, Level.EASY)).toBe("Color Games · Odd one out · Practice");
  });

  it("writes a spoiler-free recall line", () => {
    expect(recall_share("Color Games · Recall #12", [9.4, 9.1, 7.2, 5, 10], LINK)).toBe(
      `Color Games · Recall #12  40.7/50\n🟩🟩🟨🟧🟩\n${LINK}`
    );
  });

  it("writes the other modes' lines", () => {
    expect(odd_share("H", 23, 2, LINK)).toBe(`H  23 found\n2 missed\n${LINK}`);
    expect(sort_share("H", 83_000, 41, LINK)).toBe(`H  1:23 · 41 moves\n${LINK}`);
    const rows = [[Hint.UP, Hint.EXACT, Hint.DOWN, Hint.EXACT, Hint.EXACT, Hint.UP], Array(6).fill(Hint.EXACT)];
    expect(hex_share("H", rows, true, LINK)).toBe(`H  2/5\n⬆️🟩⬇️🟩🟩⬆️\n🟩🟩🟩🟩🟩🟩\n${LINK}`);
    expect(hex_share("H", [], false, LINK)).toBe(`H  X/5\n${LINK}`);
  });

  it("carries mode and seed in a challenge, and the level only when it matters", () => {
    expect(challenge_props(Mode.RECALL, "2026-10-29", Level.EASY)).toEqual({ mode: Mode.RECALL, seed: "2026-10-29" });
    expect(challenge_props(Mode.SORT, 77, Level.EASY)).toEqual({ mode: Mode.SORT, seed: 77 });
    expect(challenge_props(Mode.SORT, 77, Level.HARD)).toEqual({ mode: Mode.SORT, seed: 77, level: Level.HARD });
  });
});
