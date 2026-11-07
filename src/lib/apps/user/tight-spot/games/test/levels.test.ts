import { describe, expect, it } from "vitest";
import { drive_route } from "./driver";
import { Outcome, SPEC, Status } from "./game";
import { features_of, Feature, junctions_of } from "./generate";
import { daily_def, LEVEL_COUNT, level_def, random_def } from "./levels";
import { route_def, ROUTE_IDS, type RouteDef } from "./route";
import { level_key, level_stars, test_stars } from "./stars";
import { town } from "./town";

function drives_clean(def: RouteDef) {
  const { state } = drive_route(def);
  expect(state.status, def.id).toBe(Status.DONE);
  expect(state.faults.map((each) => `${each.severity} ${each.kind}: ${each.note}`), def.id).toEqual([]);
  expect(state.end?.outcome, def.id).toBe(Outcome.PASS);
  expect(state.park, def.id).not.toBeNull();
}

describe("the ladder", () => {
  it("starts with the three hand-made routes, saved under their old keys", () => {
    ROUTE_IDS.forEach((id, i) => {
      expect(level_def(i + 1, SPEC)).toBe(route_def(id));
      expect(level_key(i + 1)).toBe(id);
    });
  });

  it("is the same every time, and grows: more junctions, each kind brought in as it goes", () => {
    const seen = new Set<Feature>();
    let last = 0;
    for (let level = ROUTE_IDS.length + 1; level <= LEVEL_COUNT; level++) {
      const def = level_def(level, SPEC);
      expect(def.id).toBe(level_key(level));
      const junctions = junctions_of(def, town());
      expect(junctions).toBeGreaterThanOrEqual(last);
      last = junctions;
      for (const feature of features_of(def, town())) seen.add(feature);
    }
    expect([...seen].sort()).toEqual(Object.values(Feature).sort());
  });

  for (let level = ROUTE_IDS.length + 1; level <= LEVEL_COUNT; level++) {
    it(`level ${level} is driven clean by the careful driver`, () => drives_clean(level_def(level, SPEC)));
  }
});

describe("random routes and the daily", () => {
  for (const seed of [11, 4242, 90210]) {
    it(`random route ${seed} is driven clean`, () => drives_clean(random_def(seed, SPEC)));
  }

  it("the daily is driven clean, the same for everyone that day", () => {
    const def = daily_def("2026-11-07", 7331, SPEC);
    expect(daily_def("2026-11-07", 7331, SPEC)).toEqual(def);
    drives_clean(def);
  });
});

describe("stars", () => {
  it("come from minors on a pass: none 3, up to 5 two, up to 15 one, a fail none", () => {
    expect(test_stars({ passed: true, minors: 0 })).toBe(3);
    expect(test_stars({ passed: true, minors: 5 })).toBe(2);
    expect(test_stars({ passed: true, minors: 6 })).toBe(1);
    expect(test_stars({ passed: true, minors: 15 })).toBe(1);
    expect(test_stars({ passed: false, minors: 0 })).toBe(0);
    expect(test_stars(undefined)).toBe(0);
  });

  it("read a level as finished once it's passed, from the best per route", () => {
    const best = { market: { passed: true, minors: 2 }, station: { passed: false, minors: 0 }, "level-4": { passed: true, minors: 0 } };
    expect(level_stars(best)).toEqual({ 1: 2, 4: 3 });
  });
});
