import { describe, expect, it } from "vitest";
import { create_game, GRAVITY, ground_at, mode_key, score, set_status, Status, step, to_world, wind_speed, type Environment, type GameState } from "./game";
import { NO_CONTROLS, SHIPS, ShipId, type Controls } from "./ships";

const DT = 1 / 120;
const MOON: Environment = { gravity: "moon", air: false, wind: false, infinite_fuel: false };

function flying(ship: ShipId = ShipId.PODS, at: Partial<GameState["ship"]> = {}, env = MOON): GameState {
  const game = set_status(create_game(ship, env, () => 0.9), Status.FLYING);
  return { ...game, ship: { ...game.ship, vx: 0, vy: 0, ...at } };
}

function run(game: GameState, seconds: number, held: Partial<Controls> = {}): GameState {
  const input = { ...NO_CONTROLS, ...held };
  for (let t = 0; t < seconds && game.status === Status.FLYING; t += DT) game = step(game, input, DT);
  return game;
}

function above_pad(ship: ShipId, vy: number, angle = 0): GameState {
  const game = flying(ship);
  const lowest = Math.max(...SHIPS[ship].feet.map((foot) => foot.y));
  return flying(ship, { x: (game.pad.x0 + game.pad.x1) / 2, y: game.pad.y - lowest - 1, vy, angle });
}

describe("step", () => {
  it("falls under the picked gravity, and floats in zero-G", () => {
    expect(run(flying(), 0.5).ship.vy).toBeCloseTo(GRAVITY.moon.g * 0.5, 0);
    expect(run(flying(ShipId.PODS, {}, { ...MOON, gravity: "zero" }), 0.5).ship.vy).toBe(0);
  });

  it("each key fires the engine on its own side", () => {
    expect(run(flying(ShipId.PODS), 0.3, { left: true }).ship.angle).toBeGreaterThan(0);
    expect(run(flying(ShipId.PODS), 0.3, { right: true }).ship.angle).toBeLessThan(0);
    expect(run(flying(ShipId.LANDER), 0.3, { left: true }).ship.angle).toBeGreaterThan(0);
    expect(run(flying(ShipId.SHUTTLE), 0.3, { left: true }).ship.angle).toBeGreaterThan(0);
  });

  it("up climbs straight on every ship", () => {
    for (const ship of Object.values(ShipId)) {
      const next = run(flying(ship), 0.5, { up: true });
      expect(next.ship.vy, ship).toBeLessThan(0);
      expect(Math.abs(next.ship.angle), ship).toBeLessThan(1e-9);
    }
  });

  it("the lander and the pods can climb on Earth; the heavy shuttle can't", () => {
    const earth = { ...MOON, gravity: "earth" as const };
    expect(run(flying(ShipId.SHUTTLE, {}, earth), 0.5, { up: true }).ship.vy).toBeGreaterThan(0);
    for (const ship of [ShipId.LANDER, ShipId.PODS]) {
      const next = run(flying(ship, {}, { ...MOON, gravity: "earth" }), 0.5, { up: true });
      expect(next.ship.vy, ship).toBeLessThan(0);
    }
  });

  it("the shuttle's rear engines push it forward", () => {
    const next = run(flying(ShipId.SHUTTLE), 0.5, { boost: true });
    expect(next.ship.vx).toBeGreaterThan(0);
    expect(Math.abs(next.ship.angle)).toBeLessThan(1e-9);
  });

  it("the shuttle answers its engines slower than the pods", () => {
    const zero = { ...MOON, gravity: "zero" as const };
    const pods = run(flying(ShipId.PODS, {}, zero), 0.5, { up: true });
    const shuttle = run(flying(ShipId.SHUTTLE, {}, zero), 0.5, { up: true });
    expect(-shuttle.ship.vy).toBeLessThan(-pods.ship.vy);
    const pods_turn = run(flying(ShipId.PODS, {}, zero), 0.3, { left: true });
    const shuttle_turn = run(flying(ShipId.SHUTTLE, {}, zero), 0.3, { left: true });
    expect(shuttle_turn.ship.angle).toBeLessThan(pods_turn.ship.angle / 2);
  });

  it("infinite fuel never burns", () => {
    const next = run(flying(ShipId.PODS, {}, { ...MOON, infinite_fuel: true }), 2, { up: true });
    expect(next.ship.fuel).toBe(100);
  });

  it("stops firing at empty", () => {
    expect(step(flying(ShipId.PODS, { fuel: 0 }), { ...NO_CONTROLS, up: true }, DT).firing.some(Boolean)).toBe(false);
  });

  it("air drags the ship towards the wind", () => {
    const air = run(flying(ShipId.PODS, { vx: 30 }, { ...MOON, gravity: "zero", air: true }), 1);
    expect(air.ship.vx).toBeLessThan(30);
    const windy = run(flying(ShipId.PODS, {}, { ...MOON, gravity: "zero", air: true, wind: true }), 1);
    expect(wind_speed(windy)).toBeGreaterThan(0);
    expect(windy.ship.vx).toBeGreaterThan(0);
  });

  it("lands slow and level on the pad, for every ship", () => {
    for (const ship of Object.values(ShipId)) expect(run(above_pad(ship, 5), 1).status, ship).toBe(Status.LANDED);
  });

  it("crashes when too fast, tilted or off the pad", () => {
    expect(run(above_pad(ShipId.PODS, 40), 1).reason).toBe("Came down too fast");
    expect(run(above_pad(ShipId.PODS, 5, 0.4), 1).status).toBe(Status.CRASHED);
    const game = flying();
    const off = 120;
    expect(run(flying(ShipId.PODS, { x: off, y: ground_at(game.terrain, off) - 10, vy: 5 }), 1).status).toBe(Status.CRASHED);
  });
});

describe("touchdown", () => {
  it("keeps the angle in one turn, so a full loop still lands level", () => {
    const looped = flying(ShipId.PODS, { angle: Math.PI * 2 - 0.01 });
    expect(Math.abs(step(looped, NO_CONTROLS, DT).ship.angle)).toBeLessThan(0.02);
  });

  it("leaves the upright feet on the pad after snapping level", () => {
    const game = above_pad(ShipId.LANDER, 5, -0.2);
    const edge = { ...game, ship: { ...game.ship, x: game.pad.x0 + 6.6 } };
    const landed = run(edge, 1);
    expect(landed.status).toBe(Status.LANDED);
    for (const foot of landed.design.feet) expect(to_world(landed.ship, foot).x).toBeGreaterThanOrEqual(landed.pad.x0);
  });

  it("scores a soft centred landing higher than a hard one", () => {
    const soft = score(run(above_pad(ShipId.PODS, 2), 1))!;
    const hard = score(run(above_pad(ShipId.PODS, 13), 1))!;
    expect(soft.total).toBeGreaterThan(hard.total);
    expect(soft.centre).toBe(200);
    expect(score(run(above_pad(ShipId.PODS, 40), 1))).toBeNull();
  });

  it("ignores fuel in the score when it can't run out", () => {
    const game = above_pad(ShipId.PODS, 2);
    expect(score(run({ ...game, env: { ...game.env, infinite_fuel: true } }, 1))!.fuel).toBe(0);
  });

  it("keys bests by ship and setup, ignoring wind without air", () => {
    expect(mode_key(ShipId.SHUTTLE, MOON)).toBe("shuttle-moon");
    expect(mode_key(ShipId.PODS, { gravity: "mars", air: false, wind: true, infinite_fuel: true })).toBe("pods-mars-inf");
  });
});
