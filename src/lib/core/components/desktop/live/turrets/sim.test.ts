import { describe, expect, test } from "vitest";
import { DEFAULT_TURRETS_OPTIONS, turrets_options } from "./options";
import {
  BARREL_LENGTH,
  PACES,
  Pool,
  TurretsSim,
  aim_angle,
  entry_fraction,
  fire_weight,
  first_wall_hit,
  pick_shooters,
  segment_distance,
  turn_toward,
  volley_delay,
  type SimInput,
} from "./sim";

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("aim", () => {
  test("points from the turret to the target", () => {
    expect(aim_angle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(aim_angle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
    expect(aim_angle({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(Math.PI);
  });

  test("turns the short way round, by at most a step", () => {
    expect(turn_toward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turn_toward(0, 0.1, 0.25)).toBe(0.1);
    // From just under +π to just over −π is a short hop across the seam, not a full turn back.
    expect(turn_toward(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeCloseTo(Math.PI - 0.05);
  });
});

describe("firing", () => {
  test("nearer turrets weigh more", () => {
    expect(fire_weight(0)).toBe(1);
    expect(fire_weight(100)).toBeGreaterThan(fire_weight(500));
  });

  test("picks distinct turrets, never a blocked one", () => {
    const turrets = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    const picked = pick_shooters(turrets, { x: 0, y: 0 }, 5, sequence(0.1, 0.5, 0.9), (turret) => turret.x === 100);
    expect(picked.sort()).toEqual([0, 2]);
  });

  test("a near turret is picked far more often than a distant one", () => {
    const turrets = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
    ];
    let near = 0;
    for (let roll = 0; roll < 100; roll++) if (pick_shooters(turrets, { x: 0, y: 0 }, 1, () => roll / 100)[0] === 0) near++;
    expect(near).toBeGreaterThan(90);
  });

  test("paces get faster and busier", () => {
    expect(PACES.chill.interval).toBeGreaterThan(PACES.normal.interval);
    expect(PACES.normal.interval).toBeGreaterThan(PACES.frantic.interval);
    expect(PACES.frantic.speed).toBeGreaterThan(PACES.chill.speed);
    expect(PACES.frantic.volley).toBeGreaterThan(PACES.chill.volley);
    expect(volley_delay(PACES.normal, () => 0)).toBeCloseTo(0.375);
    expect(volley_delay(PACES.normal, () => 1)).toBeCloseTo(0.625);
  });
});

describe("collision", () => {
  const wall = { x: 100, y: 0, width: 50, height: 100 };

  test("finds where a segment enters a rect", () => {
    expect(entry_fraction({ x: 0, y: 50 }, { x: 200, y: 50 }, wall)).toBeCloseTo(0.5);
    expect(entry_fraction({ x: 120, y: 50 }, { x: 130, y: 50 }, wall)).toBe(0);
    expect(entry_fraction({ x: 0, y: 150 }, { x: 200, y: 150 }, wall)).toBeNull();
    expect(entry_fraction({ x: 0, y: 50 }, { x: 90, y: 50 }, wall)).toBeNull();
  });

  test("the nearest wall stops the bolt", () => {
    const near = { x: 50, y: 0, width: 10, height: 100 };
    expect(first_wall_hit({ x: 0, y: 50 }, { x: 200, y: 50 }, [wall, near])).toEqual({ x: 50, y: 50 });
    expect(first_wall_hit({ x: 0, y: 50 }, { x: 40, y: 50 }, [wall, near])).toBeNull();
  });

  test("distance from a moving bolt to the cursor", () => {
    expect(segment_distance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 4 })).toBe(4);
    expect(segment_distance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 4 })).toBe(5);
  });
});

describe("Pool", () => {
  test("reuses inactive slots and stops at capacity", () => {
    const pool = new Pool<{ active: boolean }>(() => ({ active: false }), 2);
    const first = pool.take()!;
    first.active = true;
    const second = pool.take()!;
    second.active = true;
    expect(pool.take()).toBeNull();
    first.active = false;
    expect(pool.take()).toBe(first);
    expect(pool.items.length).toBe(2);
  });
});

describe("TurretsSim", () => {
  const base: SimInput = {
    turrets: [{ x: 0, y: 50 }],
    pointer: { x: 300, y: 50 },
    fire: true,
    pace: PACES.normal,
    walls: null,
    width: 400,
    height: 100,
  };

  function run(sim: TurretsSim, input: SimInput, seconds: number) {
    const totals = { shots: 0, hits: 0, impacts: [] as { x: number; y: number }[] };
    for (let t = 0; t < seconds; t += 0.016) {
      const events = sim.update(0.016, input);
      totals.shots += events.shots;
      totals.hits += events.hits;
      totals.impacts.push(...events.impacts);
    }
    return totals;
  }

  test("fires at the cursor and hits it with a puff", () => {
    const sim = new TurretsSim(() => 0.5);
    const totals = run(sim, base, 1.2);
    expect(totals.shots).toBeGreaterThan(0);
    expect(totals.hits).toBeGreaterThan(0);
    expect(sim.particles.items.some((particle) => particle.kind === "puff")).toBe(true);
  });

  test("a bolt leaves the barrel's tip", () => {
    const sim = new TurretsSim(() => 0.5);
    const bolt = sim.fire({ x: 0, y: 0 }, { x: 100, y: 0 }, 100)!;
    expect(bolt.x).toBeCloseTo(BARREL_LENGTH);
    expect(bolt.vx).toBeCloseTo(100);
  });

  test("shield: a window between turret and cursor takes every bolt, at its edge", () => {
    const sim = new TurretsSim(() => 0.5);
    const totals = run(sim, { ...base, walls: [{ x: 100, y: 0, width: 300, height: 100 }] }, 1.2);
    expect(totals.shots).toBeGreaterThan(0);
    expect(totals.hits).toBe(0);
    expect(totals.impacts.length).toBeGreaterThan(0);
    for (const impact of totals.impacts) {
      expect(impact.x).toBeCloseTo(100);
      expect(impact.y).toBeCloseTo(50);
    }
    expect(sim.particles.items.some((particle) => particle.kind === "spark")).toBe(true);
  });

  test("shield: a widget takes a bolt where it enters", () => {
    const sim = new TurretsSim(() => 0.5);
    const widget = { x: 200, y: 20, width: 80, height: 60 };
    sim.fire({ x: 0, y: 0 }, { x: 240, y: 60 }, 460);
    const totals = run(sim, { ...base, pointer: null, walls: [widget] }, 1);
    expect(totals.impacts.length).toBe(1);
    expect(totals.impacts[0].x).toBeCloseTo(200);
    expect(totals.impacts[0].y).toBeCloseTo(50);
  });

  test("shield: a cursor over a shield is hidden, even right at its edge", () => {
    // Bolts step 7.36px a frame from x = 9, so one stops at 97.3: short of the shield, but within the hit radius of the cursor.
    const sim = new TurretsSim(() => 0.5);
    const totals = run(sim, { ...base, turrets: [{ x: 3, y: 50 }], pointer: { x: 101, y: 50 }, walls: [{ x: 100, y: 0, width: 80, height: 100 }] }, 3);
    expect(totals.shots).toBeGreaterThan(0);
    expect(totals.hits).toBe(0);
    expect(totals.impacts.length).toBeGreaterThan(0);
    expect(sim.particles.items.some((particle) => particle.active && particle.kind === "puff")).toBe(false);
  });

  test("shield: a cursor in the open next to a shield still gets hit", () => {
    const sim = new TurretsSim(() => 0.5);
    const totals = run(sim, { ...base, pointer: { x: 300, y: 50 }, walls: [{ x: 100, y: 70, width: 80, height: 30 }] }, 1.2);
    expect(totals.hits).toBeGreaterThan(0);
    expect(totals.impacts.length).toBe(0);
  });

  test("shield: a turret under a window holds fire", () => {
    const sim = new TurretsSim(() => 0.5);
    expect(run(sim, { ...base, walls: [{ x: -10, y: 0, width: 20, height: 100 }] }, 1).shots).toBe(0);
  });

  test("no cursor, no fire; bolts in flight still finish", () => {
    const sim = new TurretsSim(() => 0.5);
    run(sim, base, 0.3);
    expect(run(sim, { ...base, pointer: null }, 2).shots).toBe(0);
    expect(sim.busy).toBe(false);
  });

  test("turrets turn toward the cursor over a few frames", () => {
    const sim = new TurretsSim(() => 0.5);
    sim.update(0.016, { ...base, fire: false, pointer: { x: 0, y: 200 } });
    expect(sim.busy).toBe(true);
    run(sim, { ...base, fire: false, pointer: { x: 0, y: 200 } }, 1);
    expect(sim.angles[0]).toBeCloseTo(Math.PI / 2);
    expect(sim.busy).toBe(false);
  });
});

describe("options", () => {
  test("defaults fill in, broken fields fall back alone", () => {
    expect(turrets_options.parse({})).toEqual(DEFAULT_TURRETS_OPTIONS);
    expect(turrets_options.parse({ mode: "follow", volume: -1 })).toEqual({ ...DEFAULT_TURRETS_OPTIONS, mode: "follow" });
  });
});
