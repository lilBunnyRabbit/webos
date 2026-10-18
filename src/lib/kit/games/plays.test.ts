import { describe, expect, it } from "vitest";
import { PlaysSchema } from "./plays";

describe("PlaysSchema", () => {
  it("reads a daily from before scores", () => {
    const old = { version: 1, games: {}, daily: { "2026-10-14": { sudoku: { ms: 61_000 } } } };
    expect(PlaysSchema.parse(old)).toEqual(old);
  });

  it("keeps a daily's score", () => {
    const scored = { version: 1, games: {}, daily: { "2026-10-17": { "crack-the-code": { ms: 90_000, score: 6 } } } };
    expect(PlaysSchema.parse(scored)).toEqual(scored);
  });

  it("keeps mode sub-keys beside app ids", () => {
    const modes = { version: 1, games: {}, daily: { "2026-10-18": { sudoku: { ms: 1 }, "color-games/recall": { ms: 9, score: 41.5 } } } };
    expect(PlaysSchema.parse(modes)).toEqual(modes);
  });
});
