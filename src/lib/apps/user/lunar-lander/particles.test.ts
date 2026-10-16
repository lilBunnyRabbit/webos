import { describe, expect, it } from "vitest";
import { create_game, set_status, Status, step } from "./game";
import { emit_crash, emit_exhaust, ParticleKind, update_particles, type Particle } from "./particles";
import { NO_CONTROLS, ShipId } from "./ships";

const DT = 1 / 120;
let seed = 1;
const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe("particles", () => {
  it("emits exhaust only from firing thrusters", () => {
    const game = set_status(create_game(ShipId.PODS), Status.FLYING);
    const idle: Particle[] = [];
    emit_exhaust(idle, step(game, NO_CONTROLS, DT), 1, rng);
    expect(idle).toHaveLength(0);
    const burning: Particle[] = [];
    emit_exhaust(burning, step(game, { ...NO_CONTROLS, up: true }, DT), 0.1, rng);
    expect(burning.length).toBeGreaterThan(0);
    expect(burning.every((p) => p.kind === ParticleKind.EXHAUST && p.vy > 0)).toBe(true);
  });

  it("burns out, so the settle loop ends", () => {
    const game = create_game(ShipId.SHUTTLE);
    let list: Particle[] = [];
    emit_crash(list, game, rng);
    expect(list.some((p) => p.kind === ParticleKind.DEBRIS)).toBe(true);
    for (let t = 0; t < 5 && list.length; t += DT) list = update_particles(list, game, 10, DT, rng);
    expect(list).toHaveLength(0);
  });
});
