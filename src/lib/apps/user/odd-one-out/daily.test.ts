import { describe, expect, it } from "vitest";
import { Mode } from "../color-recall/modes";
import { resolve_seed } from "../color-recall/seed";
import { odd_round } from "./odd";
import { odd_share } from "./share";

const LINK = "https://example.test/#/solo/odd-one-out?seed=2026-10-29";

// Pinned from Color Games before the split (ADR-071): the same day keeps the same puzzle.
describe("Odd One Out daily", () => {
  it("plays 2026-10-25 as Color Games › Odd one out did", () => {
    const seed = resolve_seed(Mode.ODD, "2026-10-25");
    expect(seed).toBe(3747818926);
    expect(odd_round(seed, 0)).toEqual({ size: 2, base: "#996f8d", odd_color: "#d2a5c5", odd: 0 });
  });

  it("writes its share line", () => {
    expect(odd_share("H", 23, 2, LINK)).toBe(`H  23 found\n2 missed\n${LINK}`);
    expect(odd_share("H", 23, 0, LINK)).toBe(`H  23 found\nNo misses\n${LINK}`);
  });
});
