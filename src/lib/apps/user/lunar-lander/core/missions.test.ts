import { describe, expect, test } from "vitest";
import { fly } from "./autopilot";
import { BODY_IDS } from "./bodies";
import { MISSIONS, random_scene } from "./missions";
import { SHIP_IDS, ship_coefficients } from "./ships";

describe("the campaign is proven", () => {
  test.each(MISSIONS.map((mission) => [mission.n, mission] as const))("mission %i: the autopilot flies it to the end", (_, mission) => {
    const proof = fly(mission.build(), ship_coefficients(mission.ship));
    expect(proof.reason).toBeUndefined();
    expect(proof.ok).toBe(true);
  });
});

test.each(SHIP_IDS.flatMap((ship) => BODY_IDS.map((body) => [ship, body] as const)))("a random %s mission on the %s is proven within a few layouts", (ship, body) => {
  const c = ship_coefficients(ship);
  const proven = [0, 1, 2, 3].some((attempt) => fly(random_scene(ship, body, 11, attempt).scene, c).ok);
  expect(proven).toBe(true);
});
