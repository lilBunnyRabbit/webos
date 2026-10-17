import { describe, expect, test } from "vitest";
import { compile } from "./compile";
import { AMMO, Simulator } from "./simulator";

const DT = 1 / 60;

function simulator(source: string): Simulator {
  const result = compile(source);
  if (!result.ok) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  return new Simulator(result.setters, result.outputs);
}

const once = (source: string, world: Record<string, number | string> = {}) => simulator(source).step(world, DT);

describe("math", () => {
  test("trig is in degrees", () => {
    expect(once("output a = sin(90)").a).toBeCloseTo(1);
    expect(once("output a = atan2(1, 1)").a).toBeCloseTo(45);
  });

  test("round is half to even, like Mathf", () => {
    expect(once("output a = round(Pitch)", { Pitch: 0.5 }).a).toBe(0);
    expect(once("output a = round(Pitch * 5)", { Pitch: 0.5 }).a).toBe(2);
    expect(once("output a = round(Pitch * 7)", { Pitch: 0.5 }).a).toBe(4);
  });

  test("sign(0) is 1; floor and ceil go towards the infinities", () => {
    expect(once("output a = sign(Pitch)", { Pitch: 0 }).a).toBe(1);
    expect(once("output a = floor(Pitch * 3)", { Pitch: -0.5 }).a).toBe(-2);
    expect(once("output a = ceil(Pitch * 3)", { Pitch: -0.5 }).a).toBe(-1);
  });

  test("division by zero follows floats", () => {
    expect(once("output a = 1 / Pitch", { Pitch: 0 }).a).toBe(Infinity);
    expect(once("output a = Pitch / Pitch", { Pitch: 0 }).a).toBeNaN();
  });

  test("deltaangle, repeat and pingpong", () => {
    expect(once("output a = deltaangle(350, Heading)", { Heading: 10 }).a).toBe(20);
    expect(once("output a = repeat(Heading, 360)", { Heading: 370 }).a).toBeCloseTo(10);
    expect(once("output a = pingpong(Heading, 10)", { Heading: 13 }).a).toBeCloseTo(7);
  });

  test("lerp clamps t, lerpunclamped doesn't", () => {
    expect(once("output a = lerp(0, 10, Throttle * 2)", { Throttle: 1 }).a).toBe(10);
    expect(once("output a = lerpunclamped(0, 10, Throttle * 2)", { Throttle: 1 }).a).toBe(20);
  });
});

describe("booleans", () => {
  test("true is 1, false is −1", () => {
    const sim = simulator("output a = 5 * (Roll == 0)");
    expect(sim.step({ Roll: 0 }, DT).a).toBe(5);
    expect(sim.step({ Roll: 1 }, DT).a).toBe(-5);
  });

  test("& stops early, so a stateful right side doesn't tick", () => {
    const sim = simulator("output a = Activate1 & (sum(1) > 0.5)\noutput total = 1");
    for (let tick = 0; tick < 60; tick++) sim.step({ Activate1: -1 }, DT);
    expect(sim.step({ Activate1: 1 }, DT).a).toBe(-1);
  });

  test("| stops early on true", () => {
    expect(once("output a = (Pitch > 0) | (1 / 0 > 0)", { Pitch: 1 }).a).toBe(1);
  });

  test("string equality and SelectedWeapon", () => {
    expect(once('output a = SelectedWeapon == "Boom 50"', { SelectedWeapon: "Boom 50" }).a).toBe(1);
    expect(once("output a = ammo(SelectedWeapon)", { [AMMO]: 12 }).a).toBe(12);
  });
});

describe("time functions", () => {
  test("rate is change per second, 0 on the first tick", () => {
    const sim = simulator("output a = rate(Altitude)");
    expect(sim.step({ Altitude: 0 }, 1).a).toBe(0);
    expect(sim.step({ Altitude: 10 }, 1).a).toBe(10);
  });

  test("smooth starts at its input, then slews", () => {
    const sim = simulator("output a = smooth(Throttle * 10, 1)");
    expect(sim.step({ Throttle: 0 }, 1).a).toBe(0);
    expect(sim.step({ Throttle: 1 }, 1).a).toBe(1);
    expect(sim.step({ Throttle: 1 }, 1).a).toBe(2);
  });

  test("sum integrates", () => {
    const sim = simulator("output a = sum(1)");
    sim.step({}, 0.5);
    expect(sim.step({}, 0.5).a).toBe(1);
  });

  test("PID derivative acts on the measurement", () => {
    const sim = simulator("output a = PID(0, Pitch, 0, 0, 1)");
    expect(sim.step({ Pitch: 0 }, 1).a).toBe(0);
    expect(sim.step({ Pitch: 2 }, 1).a).toBe(-2);
  });
});

describe("setters", () => {
  test("@prev reads last tick: a counter", () => {
    const sim = simulator("var counter = @prev counter + 1\noutput n = counter");
    expect([sim.step({}, 1).n, sim.step({}, 1).n, sim.step({}, 1).n]).toEqual([1, 2, 3]);
  });

  test("@prev of another var reads its value before this tick's update", () => {
    const sim = simulator("var seen = @prev level\nvar level = Throttle");
    sim.step({ Throttle: 0.25 }, 1);
    expect(sim.step({ Throttle: 0.75 }, 1).seen).toBe(0.25);
  });

  test("Time is the simulator's clock", () => {
    const sim = simulator("output t = Time");
    sim.step({}, 0.5);
    expect(sim.step({}, 0.5).t).toBe(0.5);
  });

  test("reset clears state", () => {
    const sim = simulator("output a = sum(1)");
    sim.step({}, 1);
    sim.reset();
    expect(sim.step({}, 1).a).toBe(1);
  });
});

describe("peek", () => {
  test("shows a tick without changing state", () => {
    const sim = simulator("output a = sum(1)");
    sim.step({}, 1);
    expect(sim.peek({}, 1).a).toBe(2);
    expect(sim.peek({}, 1).a).toBe(2);
    expect(sim.time).toBe(1);
    expect(sim.step({}, 1).a).toBe(2);
  });
});
