import { expect, test } from "vitest";
import { LEVEL_COUNT, level_round, measure_round, rig_of } from "./game";
import { mow_level, WORST_GROWING } from "./prove";

test("every zero-turn level after the twelve is no further over par for the driver than the first twelve", () => {
  const ratios = new Map<number, number>();
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const round = level_round(level);
    if (rig_of(round).towed) continue;
    const run = mow_level(round);
    expect(run.done, `level ${level}`).toBe(true);
    ratios.set(level, run.ms / measure_round(round).par_ms);
  }
  const worst = Math.max(...[...ratios].filter(([level]) => level <= 12).map(([, ratio]) => ratio));
  expect(worst).toBeLessThanOrEqual(WORST_GROWING);
  for (const [level, ratio] of ratios) if (level > 12) expect(ratio, `level ${level}`).toBeLessThanOrEqual(worst);
}, 300_000);
