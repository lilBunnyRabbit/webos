import { describe, expect, test } from "vitest";
import { rect } from "./geometry";
import { obstacles } from "./obstacles";
import { drive, plan } from "./planner";
import { carry, pass_portals } from "./portals";
import { SolidKind, type Portal, type Solid } from "./scene";
import { create_car, Gear, HATCH_TRAILER, HATCHBACK, shift, step, type Car } from "./vehicle";

const TURNED: Portal = {
  mouth: rect(10, 0, 10.5, 4),
  heading: 0,
  from: { x: 10, y: 2, heading: 0 },
  to: { x: 50, y: -20, heading: Math.PI / 2 },
};

const BACK: Portal = { mouth: rect(48, -21, 52, -20.5), heading: -Math.PI / 2, from: TURNED.to, to: TURNED.from };

function rolling(car: Car, steps: number, throttle: number): Car {
  let at = car;
  for (let i = 0; i < steps; i++) at = step(at, { steer: 0.2, throttle, brake: 0 }, 1 / 120, HATCH_TRAILER);
  return at;
}

describe("portals", () => {
  test("carrying there and back is the same pose, trailers included", () => {
    const pose = { x: 10.2, y: 1.4, heading: 0.3, trailers: [{ heading: 0.1, roll: [0, 0] as [number, number] }] };
    const there = carry(pose, TURNED);
    expect(there.heading).toBeCloseTo(0.3 + Math.PI / 2);
    expect(there.trailers![0].heading).toBeCloseTo(0.1 + Math.PI / 2);
    const back = carry(there, BACK);
    expect(back.x).toBeCloseTo(pose.x);
    expect(back.y).toBeCloseTo(pose.y);
    expect(back.heading).toBeCloseTo(pose.heading);
    expect(back.trailers![0].heading).toBeCloseTo(pose.trailers[0].heading);
  });

  test("a rig rolling into a mouth comes out with its speed, gear, steer and hinge kept; backing out of it, it stays", () => {
    const start = shift(create_car({ x: 7, y: 2, heading: 0 }, Gear.PARK, HATCH_TRAILER), Gear.DRIVE, HATCH_TRAILER);
    let car = start;
    let before: Car | null = null;
    let passed: Car | null = null;
    for (let i = 0; i < 600 && !passed; i++) {
      car = rolling(car, 1, 1);
      const out = pass_portals(car, [TURNED]);
      if (out !== car) [before, passed] = [car, out];
      car = out;
    }
    expect(passed).not.toBeNull();
    expect(passed!.speed).toBeGreaterThan(0);
    expect(passed!.speed).toBe(before!.speed);
    expect(passed!.x).toBeGreaterThan(40);
    const hinge = (rig: Car) => rig.trailers![0].heading - rig.heading;
    expect(hinge(passed!)).toBeCloseTo(hinge(before!));
    expect(passed!.steer).toBe(before!.steer);
    expect(passed!.gear).toBe(Gear.DRIVE);

    const reversing: Car = { ...create_car({ x: 10.2, y: 2, heading: 0 }, Gear.REVERSE, HATCHBACK), speed: -1 };
    expect(pass_portals(reversing, [TURNED])).toBe(reversing);
  });

  test("the planner crosses a portal to a floor it can't otherwise reach", () => {
    const wall = (x0: number, y0: number, x1: number, y1: number): Solid => ({ kind: SolidKind.WALL, shape: rect(x0, y0, x1, y1) });
    const solids = [
      wall(-1, -1, 21, 0),
      wall(-1, 8, 21, 9),
      wall(-1, 0, 0, 8),
      wall(20, 0, 21, 8),
      wall(29, -1, 51, 0),
      wall(29, 8, 51, 9),
      wall(29, 0, 30, 8),
      wall(50, 0, 51, 8),
    ];
    const ramp: Portal = { mouth: rect(13, 0, 13.5, 8), heading: 0, from: { x: 13, y: 0, heading: 0 }, to: { x: 33, y: 0, heading: 0 } };
    const near = obstacles({ solids });
    const from = { x: 2, y: 4, heading: 0 };
    const to = { x: 44, y: 4, heading: 0 };
    expect(plan(from, to, near, { spec: HATCHBACK, max_expansions: 20_000 })).toBeNull();
    const found = plan(from, to, near, { spec: HATCHBACK, portals: [ramp] });
    expect(found).not.toBeNull();
    let at = found!.path[0];
    for (const move of found!.moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / 0.15));
      for (let k = 0; k < pieces; k++) at = drive(at, { ...move, distance: move.distance / pieces }, HATCHBACK, [ramp]);
    }
    expect(at.x).toBeCloseTo(found!.path.at(-1)!.x);
    expect(at.x).toBeGreaterThan(30);
  });
});
