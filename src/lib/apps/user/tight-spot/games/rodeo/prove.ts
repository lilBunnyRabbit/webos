import { describe, expect, test } from "vitest";
import type { Vehicle } from "../../core/vehicle";
import { course_round, create_game, level_round } from "./game";
import { plan_course } from "./plan";

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

export function prove_levels(from: number, to: number) {
  describe("a rodeo level can be driven clean from its start", () => {
    for (let level = from; level <= to; level++) {
      test(`level ${level}`, { timeout: 120_000 }, () => {
        expect(plan_course(create_game(level_round(level))).fault).toBeNull();
      });
    }
  });
}
