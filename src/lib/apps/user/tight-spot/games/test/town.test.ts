import { describe, expect, it } from "vitest";
import { collide, obstacles } from "../../core/obstacles";
import { create_car, Gear } from "../../core/vehicle";
import { SPEC } from "./game";
import { build_route, ROUTE_IDS, route_span } from "./route";
import { build_town, light_at, Light, on_road, town } from "./town";

describe("the town", () => {
  it("links every lane to lanes that exist", () => {
    const built = build_town();
    for (const lane of Object.values(built.lanes)) for (const next of lane.next) expect(built.lanes[next], `${lane.id} → ${next}`).toBeDefined();
  });

  it("runs the lights in turn, never both green", () => {
    for (let ms = 0; ms < 40000; ms += 250) expect(light_at(0, ms) === Light.GREEN && light_at(1, ms) === Light.GREEN).toBe(false);
  });

  for (const id of ROUTE_IDS) {
    it(`lays route ${id} on the asphalt, joined up and within the lock`, () => {
      const route = build_route(town(), id, SPEC);
      expect(route.length).toBeGreaterThan(900);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1];
        const b = route.points[i];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.8);
        expect(on_road(town(), b), `${route.lanes[i]} at ${b.x.toFixed(1)}, ${b.y.toFixed(1)}`).toBe(true);
      }
      for (let i = 4; i < route.points.length - 4; i += 2) {
        const turn = Math.abs(((route.headings[i + 4] - route.headings[i - 4] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        const length = route.ss[i + 4] - route.ss[i - 4];
        expect(turn / length, `${route.lanes[i]}`).toBeLessThan(1 / 4.8);
      }
      const car = create_car(route.start, Gear.PARK, SPEC);
      expect(collide(car, obstacles(town()), SPEC)).toBeNull();
    });
  }

  it("cuts a route span at exact distances, so the guide line slides instead of stepping", () => {
    const route = build_route(town(), ROUTE_IDS[0], SPEC);
    for (const from of [3.2, 3.45, 40.01]) {
      const span = route_span(route, from, from + 20, 0);
      let length = 0;
      for (let i = 1; i < span.length; i++) length += Math.hypot(span[i].x - span[i - 1].x, span[i].y - span[i - 1].y);
      expect(length).toBeCloseTo(20, 1);
      expect(span.slice(1, -1)).toEqual(route.points.filter((_, i) => route.ss[i] > from && route.ss[i] < from + 20));
    }
  });
});
