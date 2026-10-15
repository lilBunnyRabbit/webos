import { describe, expect, test } from "vitest";
import { analyze_off_thread } from "./analysis";
import { analyze_solution, Ink, Verdict } from "./puzzle";

describe("analyze_off_thread", () => {
  test("gives the same answer as a direct call", async () => {
    const palette = [Ink.FOREGROUND];
    for (const cells of [
      [1, 1, 1, 0],
      [1, 0, 0, 1],
    ]) {
      const job = analyze_off_thread({ width: 2, height: 2, palette, cells, budget: 4000, time_ms: 400 });
      expect(await job.result).toEqual(analyze_solution(2, 2, palette, cells, 4000));
    }
    const diagonal = await analyze_off_thread({
      width: 2,
      height: 2,
      palette,
      cells: [1, 0, 0, 1],
      budget: 4000,
      time_ms: 400,
    }).result;
    expect(diagonal.verdict).toBe(Verdict.MULTIPLE);
  });
});
