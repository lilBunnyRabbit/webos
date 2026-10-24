import { describe, expect, test } from "vitest";
import { PROJECTS } from "./evidence";
import { PALETTE_DURATION, palette_frame, SEASONS, SEASONS_DURATION, watched_at, WEBOS, WEBOS_DURATION, webos_frame } from "./project-scenes";
import { DURATIONS } from "./project-timing";

describe("project graphics", () => {
  test("every featured card has a graphic with a length", () => {
    for (const project of PROJECTS) expect(DURATIONS[project.id]).toBeGreaterThan(0);
  });

  test("Series Tracker starts with nothing watched and ends with every watched episode ticked, inside its length", () => {
    const watched = SEASONS.reduce((sum, season) => sum + season.watched, 0);
    expect(watched_at(0)).toBe(0);
    expect(watched_at(SEASONS_DURATION)).toBe(watched);
    expect(watched_at(SEASONS_DURATION - 300)).toBe(watched);
  });

  test("WebOS starts on an empty desktop and settles, inside its length, with both windows snapped to their halves", () => {
    const start = webos_frame(0);
    expect(start.shown).toEqual([0, 0]);
    expect(start.front).toBe(-1);

    const end = webos_frame(WEBOS_DURATION - 100);
    expect(end).toEqual(webos_frame(WEBOS_DURATION));
    expect(end.shown).toEqual([1, 1]);
    expect(end.rects).toEqual(WEBOS.windows.map((win) => win.snap.to));
    expect(end.previews).toEqual([0, 0]);
  });

  test("WebOS shows each snap preview only around its own snap", () => {
    const [first, second] = WEBOS.windows;
    expect(webos_frame(first.snap.at).previews[0]).toBe(1);
    expect(webos_frame(first.snap.at).previews[1]).toBe(0);
    expect(webos_frame(second.snap.at).previews).toEqual([0, 1]);
  });

  test("Chromatics types, resolves into swatches, then tints, and is settled inside its length", () => {
    const start = palette_frame(0);
    expect(start.typed).toBe(0);
    expect(start.swatches.every((p) => p === 0)).toBe(true);

    const end = palette_frame(PALETTE_DURATION - 200);
    expect(end).toEqual(palette_frame(PALETTE_DURATION));
    expect(end.line).toBe(0);
    expect(end.swatches.every((p) => p === 1)).toBe(true);
    expect(end.tint).toBe(1);

    for (let t = 0; t < PALETTE_DURATION; t += 50) {
      const frame = palette_frame(t);
      if (frame.swatches[0] > 0) expect(frame.typed).toBe(1);
      if (frame.tint > 0) expect(frame.swatches.every((p) => p === 1)).toBe(true);
    }
  });
});
