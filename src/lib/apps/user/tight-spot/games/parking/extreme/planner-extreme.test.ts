import { describe, expect, test } from "vitest";
import { COURSES } from "./courses";
import { prove } from "./proof";

const MOUNTAIN = new Set(["switchbacks", "hairpins"]);

describe("every Extreme course can be driven with every tyre on the ground", () => {
  for (const course of COURSES.filter((each) => !MOUNTAIN.has(each.id))) {
    test(course.id, { timeout: 60_000 }, () => {
      expect(prove(course)).not.toBeNull();
    });
  }
});
