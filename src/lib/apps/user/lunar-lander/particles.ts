import { ground_at, rotate, to_world, type GameState, type Point } from "./game";
import { ThrusterKind } from "./ships";

export const ParticleKind = { EXHAUST: "exhaust", DUST: "dust", DEBRIS: "debris", FLASH: "flash" } as const;
export type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  spin: number;
  angle: number;
}

type Rng = () => number;

const MAX_PARTICLES = 600;
const EXHAUST_SPEED = { main: 70, light: 35 } as const;
const EXHAUST_RATE = { main: 90, light: 25 } as const;

function particle(kind: ParticleKind, at: Point, velocity: Point, life: number, size: number, rng: Rng): Particle {
  return { kind, x: at.x, y: at.y, vx: velocity.x, vy: velocity.y, age: 0, life, size, spin: (rng() - 0.5) * 12, angle: rng() * Math.PI * 2 };
}

function push(list: Particle[], next: Particle) {
  if (list.length >= MAX_PARTICLES) list.shift();
  list.push(next);
}

/** Per physics step, so the plume's density doesn't depend on the frame rate. */
export function emit_exhaust(list: Particle[], game: GameState, dt: number, rng: Rng) {
  game.design.thrusters.forEach((thruster, i) => {
    if (!game.firing[i]) return;
    const main = thruster.kind === ThrusterKind.MAIN;
    const expected = (main ? EXHAUST_RATE.main : EXHAUST_RATE.light) * dt;
    const count = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
    const out = rotate(game.ship.angle, { x: -thruster.dir.x, y: -thruster.dir.y });
    const nozzle = to_world(game.ship, thruster.at);
    for (let n = 0; n < count; n++) {
      const speed = (main ? EXHAUST_SPEED.main : EXHAUST_SPEED.light) * (0.7 + rng() * 0.6);
      const spread = (rng() - 0.5) * 0.5;
      const dir = { x: out.x - out.y * spread, y: out.y + out.x * spread };
      push(
        list,
        particle(
          ParticleKind.EXHAUST,
          nozzle,
          { x: game.ship.vx + dir.x * speed, y: game.ship.vy + dir.y * speed },
          (main ? 0.45 : 0.25) * (0.7 + rng() * 0.6),
          main ? 1.4 : 0.8,
          rng
        )
      );
    }
  });
}

export function emit_crash(list: Particle[], game: GameState, rng: Rng) {
  push(list, particle(ParticleKind.FLASH, game.ship, { x: 0, y: 0 }, 0.5, 4, rng));
  const outline = game.design.hull.map((point) => to_world(game.ship, point));
  for (let n = 0; n < 36; n++) {
    const from = outline[n % outline.length];
    const angle = -Math.PI * (0.1 + rng() * 0.8);
    const speed = 20 + rng() * 60;
    push(
      list,
      particle(
        ParticleKind.DEBRIS,
        { x: from.x + (game.ship.x - from.x) * rng(), y: from.y + (game.ship.y - from.y) * rng() },
        { x: game.ship.vx * 0.3 + Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        1 + rng() * 0.8,
        0.8 + rng() * 1.6,
        rng
      )
    );
  }
  emit_dust(list, game.ship.x, ground_at(game.terrain, game.ship.x), 24, 40, rng);
}

export function emit_dust(list: Particle[], x: number, y: number, count: number, speed: number, rng: Rng) {
  for (let n = 0; n < count; n++) {
    const side = rng() < 0.5 ? -1 : 1;
    push(
      list,
      particle(
        ParticleKind.DUST,
        { x: x + (rng() - 0.5) * 6, y: y - 0.5 },
        { x: side * speed * (0.3 + rng() * 0.7), y: -speed * 0.25 * rng() },
        0.6 + rng() * 0.6,
        1 + rng() * 1.5,
        rng
      )
    );
  }
}

/** Exhaust that reaches the ground turns into dust thrown sideways, so a low hover kicks up the surface. */
export function update_particles(list: Particle[], game: GameState, gravity: number, dt: number, rng: Rng): Particle[] {
  const kept: Particle[] = [];
  for (const p of list) {
    p.age += dt;
    if (p.age >= p.life) continue;
    if (p.kind === ParticleKind.FLASH) {
      kept.push(p);
      continue;
    }
    const drag = p.kind === ParticleKind.DEBRIS ? 0.2 : p.kind === ParticleKind.DUST ? 2.5 : 1.2;
    const fall = p.kind === ParticleKind.DEBRIS ? gravity : p.kind === ParticleKind.DUST ? gravity * 0.3 : 0;
    p.vx -= p.vx * drag * dt;
    p.vy += fall * dt - p.vy * drag * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;

    const floor = ground_at(game.terrain, p.x);
    if (p.y >= floor) {
      if (p.kind === ParticleKind.EXHAUST) {
        const speed = Math.hypot(p.vx, p.vy);
        if (rng() < 0.5) emit_dust(kept, p.x, floor, 1, speed * 0.5, rng);
        continue;
      }
      p.y = floor - 0.1;
      if (p.kind === ParticleKind.DEBRIS) {
        p.vy = -Math.abs(p.vy) * 0.3;
        p.vx *= 0.6;
        p.spin *= 0.5;
      } else p.vy = 0;
    }
    kept.push(p);
  }
  return kept.length > MAX_PARTICLES ? kept.slice(-MAX_PARTICLES) : kept;
}
