import { describe, expect, test } from "vitest";
import { fly } from "./autopilot";
import type { Scene } from "./mission";
import { MISSIONS } from "./missions";
import { ship_coefficients } from "./ships";

// Proof margins: a mission that only passes as drawn breaks on the next retune (the Harbour lesson), so each one is
// flown again from a little off its start, drifting, and in a little more wind either way.
const NUDGES: [string, (scene: Scene) => Scene][] = [
  ["20 m back", (s) => ({ ...s, start: { ...s.start, x: s.start.x - 20 } })],
  ["20 m on", (s) => ({ ...s, start: { ...s.start, x: s.start.x + 20 } })],
  ["12 % higher", (s) => ({ ...s, start: { ...s.start, agl: s.start.agl * 1.12 } })],
  ["12 % lower", (s) => ({ ...s, start: { ...s.start, agl: s.start.agl * 0.88 } })],
  ["drifting back", (s) => ({ ...s, start: { ...s.start, vx: s.start.vx - 3 } })],
  ["more wind", (s) => ({ ...s, weather: { ...s.weather, wind: s.weather.wind + 1.5 } })],
  ["less wind", (s) => ({ ...s, weather: { ...s.weather, wind: s.weather.wind - 1.5 } })],
];

describe.each(MISSIONS.map((mission) => [mission.n, mission] as const))("mission %i keeps its proof when nudged", (_, mission) => {
  test.each(NUDGES)("%s", (_name, nudge) => {
    const proof = fly(nudge(mission.build()), ship_coefficients(mission.ship));
    expect(proof.reason).toBeUndefined();
  });
});
