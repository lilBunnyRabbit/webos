import { describe, expect, it } from "vitest";
import { Level } from "./modes";
import { puzzle_number } from "./seed";
import { band, challenge_props, recall_share, share_head } from "./share";

const LINK = "https://example.test/#/solo/color-recall?seed=2026-10-29";

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
    expect(share_head("Color Recall", "2026-10-29", Level.EASY)).toBe("Color Recall #12");
    expect(share_head("Gradient Sort", 123, Level.HARD)).toBe("Gradient Sort · Practice (Hard)");
    expect(share_head("Odd One Out", 123, Level.EASY)).toBe("Odd One Out · Practice");
  });

  it("writes a spoiler-free recall line", () => {
    expect(recall_share("Color Recall #12", [9.4, 9.1, 7.2, 5, 10], LINK)).toBe(`Color Recall #12  40.7/50\n🟩🟩🟨🟧🟩\n${LINK}`);
  });

  it("carries the seed in a challenge, and the level only when it matters", () => {
    expect(challenge_props("2026-10-29", Level.EASY)).toEqual({ seed: "2026-10-29" });
    expect(challenge_props("2026-10-29", Level.HARD)).toEqual({ seed: "2026-10-29" });
    expect(challenge_props(77, Level.EASY)).toEqual({ seed: 77 });
    expect(challenge_props(77, Level.HARD)).toEqual({ seed: 77, level: Level.HARD });
  });
});
