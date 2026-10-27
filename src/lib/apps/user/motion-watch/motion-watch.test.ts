import { describe, expect, test } from "vitest";
import type { WebmChunk } from "$kit/utils/video/webm";
import { MotionDetector, WARMUP_FRAMES } from "./detect";
import { clip_name, day_of, expired_days, parse_events, serialize_events } from "./events";
import { CLIP, ClipRecorder, type MotionStep } from "./recorder";
import { ALL_ZONES, CELLS, DETECT, GRID, detect_config, paint_zones, watched_count, zone_mask } from "./settings";

const SIZE = DETECT.WIDTH * DETECT.HEIGHT;

function scene(square?: { x: number; y: number; side: number }, light = 80): Float32Array {
  const gray = new Float32Array(SIZE).fill(light);
  if (!square) return gray;
  for (let y = square.y; y < square.y + square.side; y++)
    for (let x = square.x; x < square.x + square.side; x++) gray[y * DETECT.WIDTH + x] = 220;
  return gray;
}

function warmed(config = detect_config({ sensitivity: 50, zones: ALL_ZONES })): MotionDetector {
  const detector = new MotionDetector(config);
  for (let i = 0; i <= WARMUP_FRAMES; i++) detector.step(scene());
  return detector;
}

describe("settings", () => {
  test("a zone cell covers 10×10 detection pixels", () => {
    const zones = paint_zones(ALL_ZONES, 0, 0, false);
    const mask = zone_mask(zones);
    expect(mask[0]).toBe(0);
    expect(mask[9 * DETECT.WIDTH + 9]).toBe(0);
    expect(mask[10]).toBe(1);
    expect(mask[10 * DETECT.WIDTH]).toBe(1);
  });

  test("painting fills the rectangle between two cells", () => {
    const zones = paint_zones(ALL_ZONES, 1 * GRID.COLUMNS + 2, 3 * GRID.COLUMNS + 4, false);
    expect(watched_count(zones)).toBe(CELLS - 9);
    expect(paint_zones(zones, 3 * GRID.COLUMNS + 4, 1 * GRID.COLUMNS + 2, true)).toBe(ALL_ZONES);
  });

  test("more sensitive means a lower threshold and a smaller blob", () => {
    const low = detect_config({ sensitivity: 0, zones: ALL_ZONES });
    const high = detect_config({ sensitivity: 100, zones: ALL_ZONES });
    expect(high.threshold).toBeLessThan(low.threshold);
    expect(high.min_area).toBeLessThan(low.min_area);
  });
});

describe("MotionDetector", () => {
  test("a still scene is quiet, a square moving in is motion in its cells", () => {
    const detector = warmed();
    expect(detector.step(scene()).motion).toBe(false);
    const seen = detector.step(scene({ x: 40, y: 30, side: 20 }));
    expect(seen.motion).toBe(true);
    expect(seen.cells).toEqual([3 * GRID.COLUMNS + 4, 3 * GRID.COLUMNS + 5, 4 * GRID.COLUMNS + 4, 4 * GRID.COLUMNS + 5]);
    expect(seen.level).toBeCloseTo(400 / SIZE);
  });

  test("a blob below the minimum area is noise", () => {
    expect(warmed().step(scene({ x: 40, y: 30, side: 4 })).motion).toBe(false);
  });

  test("motion in an ignored cell doesn't count", () => {
    const zones = paint_zones(ALL_ZONES, 3 * GRID.COLUMNS + 4, 4 * GRID.COLUMNS + 5, false);
    const detector = warmed(detect_config({ sensitivity: 50, zones }));
    expect(detector.step(scene({ x: 40, y: 30, side: 20 })).motion).toBe(false);
  });

  test("the whole picture brightening is lights, not motion", () => {
    const seen = warmed().step(scene(undefined, 200));
    expect(seen).toMatchObject({ motion: false, lights: true });
  });

  test("something that stays fades into the background", () => {
    const detector = warmed();
    const parked = scene({ x: 40, y: 30, side: 20 });
    let last = detector.step(parked);
    for (let i = 0; i < 120; i++) last = detector.step(parked);
    expect(last.motion).toBe(false);
  });

  test("nothing counts while the background warms up", () => {
    const detector = new MotionDetector(detect_config({ sensitivity: 100, zones: ALL_ZONES }));
    detector.step(scene());
    expect(detector.step(scene({ x: 0, y: 0, side: 30 })).motion).toBe(false);
  });
});

const FRAME_US = 100_000;

function feed(recorder: ClipRecorder, from: number, to: number, motion: (time: number) => boolean) {
  const clips = [];
  for (let time = from; time < to; time += FRAME_US) {
    recorder.chunk({ track: "video", timestamp: time, key: time % 2_000_000 === 0, data: new Uint8Array(1) } satisfies WebmChunk);
    const step: MotionStep = { time, wall: 1_000_000 + time / 1000, motion: motion(time), level: 0.2, cells: [3] };
    const clip = recorder.step(step);
    if (clip) clips.push(clip);
  }
  return clips;
}

describe("ClipRecorder", () => {
  test("a clip starts on a keyframe at least 5 s before the motion and runs 5 s past it", () => {
    const recorder = new ClipRecorder();
    const clips = feed(recorder, 0, 30_000_000, (time) => time >= 10_000_000 && time < 12_000_000);
    expect(clips).toHaveLength(1);
    const [clip] = clips;
    expect(clip.chunks[0]).toMatchObject({ timestamp: 0, key: true });
    // Motion confirmed on its second frame, 10.1 s: the newest keyframe at or before 5.1 s is 4 s.
    const span_us = clip.chunks[clip.chunks.length - 1].timestamp;
    expect(span_us).toBe(11_900_000 + CLIP.POST_US - 4_000_000);
    expect(clip.at).toBe(1_000_000 + 10_100);
    expect(clip.end).toBe(1_000_000 + 11_900);
    expect(clip.cells).toEqual([3]);
  });

  test("the ring keeps about 7 s, so motion right after start takes what there is", () => {
    const recorder = new ClipRecorder();
    const clips = feed(recorder, 0, 10_000_000, (time) => time >= 1_000_000 && time < 1_500_000);
    expect(clips[0].chunks[0]).toMatchObject({ timestamp: 0, key: true });
    expect(clips[0].chunks).toHaveLength(Math.round((1_400_000 + CLIP.POST_US) / FRAME_US) + 1);
  });

  test("one noisy frame starts nothing", () => {
    const recorder = new ClipRecorder();
    expect(feed(recorder, 0, 20_000_000, (time) => time === 10_000_000)).toEqual([]);
    expect(recorder.active).toBe(false);
  });

  test("finish() cuts a clip in progress", () => {
    const recorder = new ClipRecorder();
    feed(recorder, 0, 12_000_000, (time) => time >= 10_000_000);
    expect(recorder.active).toBe(true);
    expect(recorder.finish()?.chunks.length).toBeGreaterThan(0);
    expect(recorder.finish()).toBeNull();
  });

  test("a long motion is cut into clips", () => {
    const recorder = new ClipRecorder();
    const clips = feed(recorder, 0, CLIP.MAX_US + 20_000_000, () => true);
    expect(clips.length).toBeGreaterThanOrEqual(1);
    expect(clips[0].duration_ms).toBeLessThanOrEqual(CLIP.MAX_US / 1000 + CLIP.PRE_US / 1000 + 2000);
  });
});

describe("events", () => {
  test("names follow the local clock", () => {
    const wall = new Date(2026, 9, 27, 7, 5, 9).getTime();
    expect(day_of(wall)).toBe("2026-10-27");
    expect(clip_name(wall)).toBe("07-05-09.webm");
  });

  test("events round-trip sorted, bad entries dropped", () => {
    const events = [
      { at: 5, end: 6, peak: 0.3, cells: [1], clip: "b.webm" },
      { at: 1, end: 2, peak: 0.1, cells: [], clip: "a.webm" },
    ];
    expect(parse_events(serialize_events(events)).map((event) => event.clip)).toEqual(["a.webm", "b.webm"]);
    expect(parse_events(JSON.stringify([{ at: 1 }, events[0]]))).toEqual([events[0]]);
    expect(parse_events("{}")).toEqual([]);
    expect(parse_events(null)).toEqual([]);
  });

  test("retention keeps today and the days before it", () => {
    const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-27", "notes"];
    expect(expired_days(days, "2026-10-27", 7)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(expired_days(["2026-10-01"], "2026-11-02", 1)).toEqual(["2026-10-01"]);
  });
});
