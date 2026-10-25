import { describe, expect, it } from "vitest";
import { Mode } from "../color-recall/modes";
import { resolve_seed } from "../color-recall/seed";
import { Hint, hex_target } from "./hex";
import { hex_share } from "./share";

const LINK = "https://example.test/#/solo/hex-guess?seed=2026-10-29";

// Pinned from Color Games before the split (ADR-071): the same day keeps the same puzzle.
describe("Hex Guess daily", () => {
  it("plays 2026-10-25 as Color Games › Hex guess did", () => {
    const seed = resolve_seed(Mode.HEX, "2026-10-25");
    expect(seed).toBe(2585163842);
    expect(hex_target(seed)).toBe("0E4501");
  });

  it("writes its share line", () => {
    const rows = [[Hint.UP, Hint.EXACT, Hint.DOWN, Hint.EXACT, Hint.EXACT, Hint.UP], Array(6).fill(Hint.EXACT)];
    expect(hex_share("H", rows, true, LINK)).toBe(`H  2/5\n⬆️🟩⬇️🟩🟩⬆️\n🟩🟩🟩🟩🟩🟩\n${LINK}`);
    expect(hex_share("H", [], false, LINK)).toBe(`H  X/5\n${LINK}`);
  });
});
