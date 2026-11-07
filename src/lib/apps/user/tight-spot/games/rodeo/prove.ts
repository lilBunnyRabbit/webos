import { describe, expect, test } from "vitest";
import type { Vehicle } from "../../core/vehicle";
import { course_round, create_game, level_round } from "./game";
import { par_of, plan_course } from "./plan";

/** A few vehicle and course pairs, split over files so they run side by side. */
export function prove_courses(pairs: readonly [Vehicle, number][]) {
  describe("a rodeo course can be driven clean, gate to gate", () => {
    for (const [vehicle, course] of pairs) {
      // Up to a few seconds each here; CI runs two to three times slower.
      test(`${vehicle} on course ${course}`, { timeout: 60_000 }, () => {
        expect(plan_course(create_game(course_round(vehicle, course))).fault).toBeNull();
      });
    }
  });
}

// A par out of these bounds is a planner run gone wrong or a time star out of reach.
const PAR_MIN = 40_000;
const PAR_MAX = 300_000;

export function prove_levels(from: number, to: number) {
  describe("a rodeo level can be driven clean from its start, with a par in reach", () => {
    for (let level = from; level <= to; level++) {
      test(`level ${level}`, { timeout: 120_000 }, () => {
        const state = create_game(level_round(level));
        const found = plan_course(state);
        expect(found.fault).toBeNull();
        const { ms } = par_of(found, state);
        expect(ms % 5000).toBe(0);
        expect(ms).toBeGreaterThanOrEqual(PAR_MIN);
        expect(ms).toBeLessThanOrEqual(PAR_MAX);
      });
    }
  });
}
