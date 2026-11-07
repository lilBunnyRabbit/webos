import { expect, test } from "vitest";
import { BODIES, BodyId } from "./bodies";
import { advance, create_flight, CrashKind, Status } from "./flight";
import { create_ship, DT, type Env } from "./lander";
import { ship_coefficients, ShipId } from "./ships";
import { ground_at, terrain } from "./world";

const c = ship_coefficients(ShipId.LANDER);

test("a rock corner between two hull points is still a crash", () => {
  const rock = [
    { x: -0.5, y: 30 },
    { x: 0, y: 9 },
    { x: 0.5, y: 30 },
  ];
  const t = terrain({ x0: -100, x1: 100, pads: [{ x: 60, width: 18 }], rocks: [rock] });
  const env: Env = { body: BODIES[BodyId.MOON], wind: 0, ground: (x) => ground_at(t, x) };
  // A spike of rock pokes down into the cabin between its two upper hull points: no hull point is inside the rock.
  const flight = create_flight({ ...create_ship(c, 0, 10 - 2.3, 0), spool: 1 });
  const next = advance(flight, { throttle: 1, turn: 0 }, c, DT, env, t);
  expect(next.status).toBe(Status.CRASHED);
  expect(next.crash?.kind).toBe(CrashKind.ROCK);
});

test("a soft edge turns the ship back instead of losing it", () => {
  const t = { ...terrain({ x0: 0, x1: 100, pads: [{ x: 50, width: 18 }] }), soft_edges: true };
  const env: Env = { body: BODIES[BodyId.MOON], wind: 0, ground: () => 0 };
  let flight = create_flight({ ...create_ship(c, 155, 5000, 0), vx: 20 });
  for (let i = 0; i < 120; i++) flight = advance(flight, { throttle: 0.4, turn: 0 }, c, DT, env, t);
  expect(flight.status).toBe(Status.FLYING);
  expect(flight.ship.x).toBeLessThanOrEqual(160);
  expect(flight.ship.vx).toBeLessThanOrEqual(0);
});
