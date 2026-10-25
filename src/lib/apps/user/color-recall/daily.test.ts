import { describe, expect, it } from "vitest";
import { Mode } from "./modes";
import { recall_rounds } from "./recall";
import { resolve_seed } from "./seed";

// Pinned from Color Games before the split (ADR-071): the same day keeps the same puzzle.
describe("Color Recall daily", () => {
  it("plays 2026-10-25 as Color Games › Recall did", () => {
    const seed = resolve_seed(Mode.RECALL, "2026-10-25");
    expect(seed).toBe(3082195392);
    expect(recall_rounds(seed).map((round) => round.hex)).toEqual(["#748ba6", "#5e4b6e", "#86e858", "#7e9e9d", "#7d5e82"]);
  });

  it("gives every game its own daily", () => {
    expect(resolve_seed(Mode.RECALL, "2026-10-18")).not.toBe(resolve_seed(Mode.HEX, "2026-10-18"));
    expect(resolve_seed(Mode.RECALL, "2026-10-18")).not.toBe(resolve_seed(Mode.RECALL, "2026-10-19"));
    expect(resolve_seed(Mode.RECALL, 7)).toBe(7);
  });
});
