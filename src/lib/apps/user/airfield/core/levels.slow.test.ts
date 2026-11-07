import { describe, expect, test } from "vitest";
import { fly } from "./autopilot";
import { LEVELS } from "./levels";
import { plane_coefficients } from "./planes";
import type { Scene } from "./round";

// Proof margins: a level that only passes as drawn breaks on the next retune (the Harbour lesson), so each one is
// flown again from a little off its start and in a little more or less wind.
const NUDGES: [string, (scene: Scene) => Scene][] = [
  ["60 m back", (s) => ({ ...s, start: { ...s.start, x: s.start.x - 60 } })],
  ["60 m on", (s) => ({ ...s, start: { ...s.start, x: s.start.x + 60 } })],
  ["12 % higher", (s) => ({ ...s, start: { ...s.start, agl: s.start.agl * 1.12 } })],
  ["12 % lower", (s) => ({ ...s, start: { ...s.start, agl: s.start.agl * 0.88 } })],
  ["more headwind", (s) => ({ ...s, course: { ...s.course, weather: { ...s.course.weather, wind: s.course.weather.wind - 1.5 } } })],
  ["more tailwind", (s) => ({ ...s, course: { ...s.course, weather: { ...s.course.weather, wind: s.course.weather.wind + 1.5 } } })],
];

describe.each(LEVELS.map((level) => [`${level.plane} ${level.n}`, level] as const))("%s keeps its proof when nudged", (_, level) => {
  test.each(NUDGES)("%s", (_name, nudge) => {
    const proof = fly(nudge(level.build()), plane_coefficients(level.plane));
    expect(proof.reason).toBeUndefined();
  });
});
