import { expect, test } from "vitest";
import { DEFAULT_PROGRESS, migrated } from "./progress";

test("the arcade game's landings and landed ships carry over once", () => {
  const legacy = { best: { "pods-moon-air": 900, lander: 700, "lander-mars": 650 }, landings: 12 };
  const carried = migrated(DEFAULT_PROGRESS, legacy)!;
  expect(carried.landings).toBe(12);
  expect(carried.ships_landed).toEqual(["lander", "pods"]);
  expect(migrated(carried, legacy)).toBeNull();
  expect(migrated(DEFAULT_PROGRESS, { best: {}, landings: 0 })).toBeNull();
});
