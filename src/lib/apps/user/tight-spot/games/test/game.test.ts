import { describe, expect, it } from "vitest";
import { Signal } from "../../core/signal";
import { create_car, Gear } from "../../core/vehicle";
import { drive_route, type DriverOptions } from "./driver";
import { bay_park, better, create_game, Outcome, record, result_of, SPEC, Status } from "./game";
import { ROUTE_IDS, RouteId, type Route } from "./route";
import { FaultKind, log_signal, passes, Severity, sheet, signalled, type Fault } from "./rules";
import { town } from "./town";

function kinds(faults: readonly Fault[]): string[] {
  return faults.map((each) => `${each.severity} ${each.kind}`);
}

function road_start(route: Route, road: string): number {
  return route.ss[route.lanes.findIndex((lane) => lane.startsWith(`${road}>`))];
}

function drive(id: RouteId, options: DriverOptions = {}) {
  const { state } = drive_route(id, options);
  expect(state.status).toBe(Status.DONE);
  return state;
}

describe("a careful driver", () => {
  for (const id of ROUTE_IDS) {
    it(`drives route ${id} clean, parks and pulls up`, () => {
      const state = drive(id);
      expect(kinds(state.faults)).toEqual([]);
      expect(state.end?.outcome).toBe(Outcome.PASS);
      expect(state.park).not.toBeNull();
    });
  }
});

describe("one mistake, one fault", () => {
  it("no signals: a fault at each turn, the roundabout exit and the pull-up, and still a pass", () => {
    const state = drive(RouteId.MARKET, { signals: false });
    expect(kinds(state.faults)).toEqual(new Array(4).fill("minor signal"));
    expect(state.end?.outcome).toBe(Outcome.PASS);
  });

  it("rolling through the stop sign fails", () => {
    const state = drive(RouteId.STATION, { stop_signs: false });
    expect(kinds(state.faults)).toEqual(["serious stop-sign"]);
    expect(state.end?.outcome).toBe(Outcome.FAIL);
  });

  it("40 through the 30 zone is one speeding fault", () => {
    const route = create_game(RouteId.SCHOOL).route;
    const from = road_start(route, "IJ") + 15;
    const state = drive(RouteId.SCHOOL, { rush: { from, to: from + 70, speed: 40 / 3.6 } });
    expect(kinds(state.faults)).toEqual(["minor speed"]);
  });

  it("the right lane at a left turn is the wrong lane", () => {
    const route = create_game(RouteId.SCHOOL).route;
    const line = route.events.find((event) => event.lane === "BE>E:1")!.s;
    const state = drive(RouteId.SCHOOL, { shift: { from: line - 60, to: line + 2, by: 3.5 } });
    expect(kinds(state.faults)).toEqual(["minor wrong-lane"]);
  });

  it("hugging the centre line is poor lane position", () => {
    const route = create_game(RouteId.MARKET).route;
    const from = road_start(route, "EF") + 30;
    const state = drive(RouteId.MARKET, { shift: { from, to: from + 40, by: -1.5 } });
    expect(kinds(state.faults)).toEqual(["minor lane-position"]);
  });
});

describe("judging", () => {
  it("counts a signal that has since cancelled itself, if it showed long enough", () => {
    let spans = log_signal([], Signal.RIGHT, 1000);
    spans = log_signal(spans, Signal.NONE, 2000);
    expect(signalled(spans, Signal.RIGHT, 4000)).toBe(true);
    expect(signalled(spans, Signal.LEFT, 4000)).toBe(false);
    expect(signalled(spans, Signal.RIGHT, 9000)).toBe(false);
    expect(signalled(log_signal([], Signal.RIGHT, 1000), Signal.RIGHT, 1300)).toBe(false);
  });

  it("passes with up to 15 minors and no serious or dangerous fault", () => {
    expect(passes({ minors: 15, serious: 0, dangerous: 0 })).toBe(true);
    expect(passes({ minors: 16, serious: 0, dangerous: 0 })).toBe(false);
    expect(passes({ minors: 0, serious: 1, dangerous: 0 })).toBe(false);
  });

  it("groups the sheet by fault, worst first", () => {
    const at = { x: 0, y: 0 };
    const rows = sheet([
      { kind: FaultKind.SIGNAL, severity: Severity.MINOR, ms: 1, at, note: "a" },
      { kind: FaultKind.RED_LIGHT, severity: Severity.SERIOUS, ms: 2, at, note: "b" },
      { kind: FaultKind.SIGNAL, severity: Severity.MINOR, ms: 3, at, note: "a" },
    ]);
    expect(rows.map((row) => [row.kind, row.count])).toEqual([
      [FaultKind.RED_LIGHT, 1],
      [FaultKind.SIGNAL, 2],
    ]);
  });

  it("judges the bay like Tight Spot: inside and straight, scored by precision", () => {
    const bay = town().bay;
    const x = (bay.shape[0].x + bay.shape[1].x) / 2;
    const y = (bay.shape[0].y + bay.shape[2].y) / 2;
    const centred = create_car({ x, y: y - 1.35, heading: Math.PI / 2 }, Gear.PARK, SPEC);
    expect(bay_park(centred, town())?.score).toBeGreaterThan(90);
    expect(bay_park({ ...centred, heading: Math.PI / 2 + 0.2 }, town())).toBeNull();
    expect(bay_park({ ...centred, x: x + 0.8 }, town())).toBeNull();
  });

  it("keeps the better result per route", () => {
    const pass = { passed: true, minors: 3, serious: 0, dangerous: 0, ms: 200000 };
    const fail = { passed: false, minors: 0, serious: 1, dangerous: 0, ms: 150000 };
    expect(better(pass, fail)).toBe(true);
    expect(better({ ...pass, minors: 2 }, pass)).toBe(true);
    const first = record({ best: {} }, RouteId.MARKET, fail);
    expect(first.first).toBe(true);
    expect(record(first.data, RouteId.MARKET, pass).improved).toBe(true);
    expect(result_of(create_game(RouteId.MARKET))).toBeNull();
  });
});
