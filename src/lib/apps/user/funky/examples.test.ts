import { describe, expect, test } from "vitest";
import { VARIABLES_BY_NAME } from "./builtins";
import { compile } from "./compile";
import { Severity } from "./diagnostics";
import { EXAMPLES, NEW_FILE } from "./examples";
import { PRESETS, PRESETS_BY_ID } from "./presets";
import { apply_due, parse_script } from "./script";
import { AMMO, Simulator, type Value } from "./simulator";

const DT = 1 / 60;

function run(example: (typeof EXAMPLES)[number], seconds: number): Record<string, Value>[] {
  const result = compile(example.source);
  const sim = new Simulator(result.setters, result.outputs);
  const world: Record<string, Value> = { ...PRESETS_BY_ID.get(example.preset)!.world };
  const { steps } = parse_script(example.script);
  apply_due(steps, -1, 0, world);
  const frames: Record<string, Value>[] = [];
  for (let tick = 0; tick < seconds * 60; tick++) {
    apply_due(steps, sim.time, sim.time + DT, world);
    frames.push(sim.step(world, DT));
  }
  return frames;
}

describe("examples", () => {
  test.each(EXAMPLES)("$name compiles without errors or warnings", (example) => {
    const result = compile(example.source);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity !== Severity.INFO)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test.each(EXAMPLES)("$name has a working preset, script and plot", (example) => {
    expect(PRESETS_BY_ID.has(example.preset)).toBe(true);
    expect(parse_script(example.script).errors).toEqual([]);
    const result = compile(example.source);
    const names = new Set([...result.setters, ...result.outputs].map((entry) => entry.name));
    for (const name of example.plot) expect(names.has(name)).toBe(true);
    const last = run(example, 10).at(-1)!;
    for (const name of example.plot) expect(Number.isFinite(last[name])).toBe(true);
  });

  test("the new-file template compiles", () => {
    expect(compile(NEW_FILE).ok).toBe(true);
  });

  test("presets only set known values", () => {
    for (const preset of PRESETS) for (const name of Object.keys(preset.world)) expect(name === AMMO || VARIABLES_BY_NAME.has(name)).toBe(true);
  });
});

describe("example behaviour", () => {
  const by_id = (id: string) => EXAMPLES.find((example) => example.id === id)!;

  test("memory: two presses toggle twice and count two", () => {
    const last = run(by_id("memory"), 5).at(-1)!;
    expect(last.counter).toBe(2);
    expect(last.light).toBe(0);
    expect(last.heldAltitude).toBe(1200);
  });

  test("gear: doors open before the legs move", () => {
    const frames = run(by_id("gear"), 4);
    const first_leg = frames.findIndex((frame) => (frame.legs as number) > 0);
    expect(frames[first_leg].doors).toBeGreaterThan(0.99);
  });

  test("weapons: guns stop out of range, missiles take over until ammo runs out", () => {
    const frames = run(by_id("weapons"), 7);
    expect(frames[90].guns).toBe(1);
    expect(frames[5 * 60].guns).toBe(-1);
    expect(frames[5 * 60].missile).toBe(1);
    expect(frames.at(-1)!.missile).toBe(-1);
  });
});
