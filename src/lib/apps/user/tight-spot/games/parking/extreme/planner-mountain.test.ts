import { describe, expect, test } from "vitest";
import { course_by_id } from "./courses";
import { prove } from "./proof";

describe("the mountain roads can be driven without going over the edge", () => {
  for (const id of ["switchbacks", "hairpins"]) {
    test(id, { timeout: 60_000 }, () => {
      expect(prove(course_by_id(id))).not.toBeNull();
    });
  }
});
