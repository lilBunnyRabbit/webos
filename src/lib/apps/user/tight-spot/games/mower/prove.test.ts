import { describe, expect, test } from "vitest";
import { top_speed } from "../../core/vehicle";
import { level_round, measure_round, tidy } from "./game";
import { RIGS } from "./rig";
import { mow_level, WORST_GROWING } from "./prove";

describe("mow day par", () => {
  test("the driver finishes the stripe and checkerboard intros, pattern laid, no further over par than on the first twelve", () => {
    for (const level of [13, 15]) {
      const round = level_round(level);
      const run = mow_level(round);
      expect(run.done, `level ${level}`).toBe(true);
      expect(tidy(run.state), `level ${level}`).toBe(true);
      expect(run.ms / measure_round(round).par_ms, `level ${level}`).toBeLessThanOrEqual(WORST_GROWING);
    }
  }, 60_000);

  test("the tractor's par speed is one it can hold", () => {
    expect(RIGS.tractor.speed).toBeLessThanOrEqual(top_speed(RIGS.tractor.spec));
    expect(RIGS.mower.speed).toBeLessThanOrEqual(top_speed(RIGS.mower.spec));
  });
});
