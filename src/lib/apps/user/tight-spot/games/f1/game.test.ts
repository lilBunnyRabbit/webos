import { describe, expect, it } from "vitest";
import { create_car, Gear, steer_base } from "../../core/vehicle";
import { drive_session } from "./autopilot";
import {
  advance,
  beats,
  best_lap,
  create_game,
  daily_track,
  lap_stars,
  lap_text,
  LAPS,
  par_ms,
  Status,
  THREE_STARS,
  type GameState,
  type LapResult,
} from "./game";
import { ghost_pose, quantise, record_frame } from "./ghost";
import { A_LAT, SPEC } from "./spec";
import { HALF_WIDTH, locate } from "./track";
import { TRACK_IDS, TrackId } from "./tracks";

const DT = 1 / 120;

function driving(track: TrackId = TrackId.MEADOW): GameState {
  return { ...create_game({ track }), status: Status.DRIVING };
}

function placed(state: GameState, s: number, lateral: number, turn: number, speed: number): GameState {
  const i = Math.round(s) % state.track.centre.length;
  const c = state.track.centre[i];
  const n = state.track.normal[i];
  const car = { ...create_car({ x: c.x + n.x * lateral, y: c.y + n.y * lateral, heading: state.track.heading[i] + turn }, Gear.DRIVE, SPEC), speed };
  return { ...state, car, at: locate(state.track, car) };
}

describe("grip", () => {
  it("never turns tighter than A_LAT / v² for long", () => {
    let state = placed(driving(), 40, 0, 0, 40);
    for (let i = 0; i < 120; i++) state = advance(state, { steer: 1, throttle: 1, brake: 0 }, DT);
    const v = Math.abs(state.car.speed);
    expect((Math.tan(state.car.steer) / steer_base(SPEC)) * v * v).toBeLessThan(A_LAT * 1.02);
  });
});

describe("the round", () => {
  it("slows the car on the grass", () => {
    const off = HALF_WIDTH + 3;
    let grass = placed(driving(), 40, off, 0, 12);
    let road = placed(driving(), 40, 0, 0, 12);
    for (let i = 0; i < 120; i++) {
      grass = advance(grass, { steer: 0, throttle: 1, brake: 0 }, DT);
      road = advance(road, { steer: 0, throttle: 1, brake: 0 }, DT);
    }
    expect(grass.grass).toBe(true);
    expect(road.grass).toBe(false);
    expect(grass.car.speed).toBeLessThan(road.car.speed - 4);
  });

  it("stops the car at a wall and voids the lap", () => {
    let state = placed(driving(), 40, HALF_WIDTH, Math.PI / 4, 8);
    state = { ...state, lap: { start_ms: 0, splits: [], clean: true, frames: [] } };
    for (let i = 0; i < 400 && !state.contact; i++) state = advance(state, { steer: 0, throttle: 1, brake: 0 }, DT);
    expect(state.contact).not.toBeNull();
    expect(state.car.speed).toBe(0);
    expect(state.lap?.clean).toBe(false);
  });

  it("starts the lap at the line, splits at both sector lines, finishes after three", () => {
    const done = drive_session(create_game({ track: TrackId.MEADOW }));
    expect(done.status).toBe(Status.DONE);
    expect(done.laps).toHaveLength(LAPS);
    for (const lap of done.laps) {
      expect(lap.clean).toBe(true);
      expect(lap.splits[0]).toBeGreaterThan(0);
      expect(lap.splits[1]).toBeGreaterThan(lap.splits[0]);
      expect(lap.ms).toBeGreaterThan(lap.splits[1]);
      expect(lap.frames.length / 3).toBeCloseTo(lap.ms / 100, -1);
    }
  });

  // The proof: the autopilot drives every track clean, through the same `advance` and grip, close enough to par for three stars.
  it.each(TRACK_IDS)("%s can be lapped clean at three-star pace", (id) => {
    const done = drive_session(create_game({ track: id }));
    const best = best_lap(done.laps);
    expect(done.laps.every((lap) => lap.clean)).toBe(true);
    expect(best).not.toBeNull();
    expect(best!.ms).toBeLessThanOrEqual(par_ms(done.track) * THREE_STARS);
    expect(lap_stars(best!, par_ms(done.track))).toBe(3);
  });
});

describe("scoring", () => {
  const lap = (ms: number, clean = true): LapResult => ({ ms, splits: [ms / 3, (ms * 2) / 3], clean, frames: [0, 0, 0] });

  it("gives stars by the share of par", () => {
    expect(lap_stars(lap(40_000), 40_000)).toBe(3);
    expect(lap_stars(lap(44_000), 40_000)).toBe(2);
    expect(lap_stars(lap(60_000), 40_000)).toBe(1);
    expect(lap_stars(lap(30_000, false), 40_000)).toBe(0);
  });

  it("keeps the quickest clean lap, and a new ghost only when it's quicker", () => {
    expect(best_lap([lap(40_000), lap(38_000, false), lap(39_000)])?.ms).toBe(39_000);
    expect(best_lap([lap(38_000, false)])).toBeNull();
    expect(beats(null, lap(50_000))).toBe(true);
    expect(beats({ ms: 45_000, splits: [1, 2], frames: [0, 0, 0] }, lap(50_000))).toBe(false);
    expect(beats({ ms: 55_000, splits: [1, 2], frames: [0, 0, 0] }, lap(50_000))).toBe(true);
    expect(beats(null, lap(40_000, false))).toBe(false);
  });

  it("formats lap times", () => {
    expect(lap_text(42_853)).toBe("42.85");
    expect(lap_text(62_350)).toBe("1:02.35");
    expect(lap_text(5_000)).toBe("5.00");
  });

  it("picks one of the tracks for the day", () => {
    for (const seed of [0, 1, 2, 12345, 2 ** 31]) expect(TRACK_IDS).toContain(daily_track(seed));
  });
});

describe("ghost", () => {
  it("records ten frames a second and plays them back between frames", () => {
    const frames: number[] = [];
    for (let k = 0; k <= 120; k++) record_frame(frames, (k * 1000) / 120, { x: (k * 10) / 120, y: 2, heading: 0.5 });
    expect(frames.length / 3).toBe(11);
    const at = ghost_pose(frames, 250)!;
    expect(at.x).toBeCloseTo(2.5, 1);
    expect(at.y).toBeCloseTo(2, 2);
    expect(at.heading).toBeCloseTo(0.5, 3);
  });

  it("keeps centimetres and milliradians", () => {
    expect(quantise({ x: 1.234, y: -5.678, heading: Math.PI * 2 + 0.1 })).toEqual([123, -568, 100]);
  });
});
