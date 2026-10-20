import { contains, type Point, type Rect } from "../geometry";
import { TurretsPace } from "./options";

export interface PaceConfig {
  /** Seconds between volleys, ±25%. */
  interval: number;
  volley: number;
  /** px/s */
  speed: number;
  pitch: number;
}

export const PACES: Record<TurretsPace, PaceConfig> = {
  [TurretsPace.CHILL]: { interval: 1.5, volley: 1, speed: 260, pitch: 0.8 },
  [TurretsPace.NORMAL]: { interval: 0.5, volley: 3, speed: 460, pitch: 1 },
  [TurretsPace.FRANTIC]: { interval: 0.14, volley: 6, speed: 760, pitch: 1.3 },
};

export const BOLT_LENGTH = 14;
export const HIT_RADIUS = 6;
export const BARREL_LENGTH = 6;
/** rad/s */
const TURN_SPEED = 9;
/** Distance at which a turret fires half as often as one under the cursor. */
const FALLOFF = 260;
const MAX_STEP = 0.05;

export const ParticleKind = {
  SPARK: "spark",
  PUFF: "puff",
} as const;
export type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export interface Bolt {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max_life: number;
}

export function aim_angle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Turns by at most `max_step` radians the short way round. */
export function turn_toward(current: number, target: number, max_step: number): number {
  const full = Math.PI * 2;
  const delta = ((((target - current + Math.PI) % full) + full) % full) - Math.PI;
  if (Math.abs(delta) <= max_step) return target;
  return current + Math.sign(delta) * max_step;
}

export function fire_weight(distance: number): number {
  return 1 / (1 + (distance / FALLOFF) ** 2);
}

/** Up to `count` distinct turrets, nearer ones likelier; `blocked` turrets never fire. */
export function pick_shooters(turrets: Point[], target: Point, count: number, rand: () => number, blocked?: (turret: Point) => boolean): number[] {
  const weights = turrets.map((turret) => (blocked?.(turret) ? 0 : fire_weight(Math.hypot(turret.x - target.x, turret.y - target.y))));
  let total = weights.reduce((sum, weight) => sum + weight, 0);
  const picked: number[] = [];
  while (picked.length < count && total > 0) {
    let roll = rand() * total;
    let index = 0;
    while (index < weights.length - 1 && (roll >= weights[index] || weights[index] === 0)) {
      roll -= weights[index];
      index++;
    }
    if (weights[index] === 0) break;
    picked.push(index);
    total -= weights[index];
    weights[index] = 0;
  }
  return picked;
}

export function volley_delay(pace: PaceConfig, rand: () => number): number {
  return pace.interval * (0.75 + rand() * 0.5);
}

/** Where the segment `a → b` first enters `rect`, as a fraction of it (0 when `a` is inside), or `null`. */
export function entry_fraction(a: Point, b: Point, rect: Rect): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let low = 0;
  let high = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return null;
  }
  return low;
}

/** The first point on `a → b` inside any wall, or `null`. */
export function first_wall_hit(a: Point, b: Point, walls: Rect[]): Point | null {
  let best: number | null = null;
  for (const wall of walls) {
    const t = entry_fraction(a, b, wall);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best === null ? null : { x: a.x + (b.x - a.x) * best, y: a.y + (b.y - a.y) * best };
}

export function segment_distance(a: Point, b: Point, point: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(a.x + dx * t - point.x, a.y + dy * t - point.y);
}

/** Fixed-size slots reused in place, so a frantic minute allocates nothing per frame. */
export class Pool<T extends { active: boolean }> {
  public readonly items: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly capacity: number
  ) {}

  public take(): T | null {
    const free = this.items.find((item) => !item.active);
    if (free) return free;
    if (this.items.length >= this.capacity) return null;
    const item = this.create();
    this.items.push(item);
    return item;
  }

  public any(): boolean {
    return this.items.some((item) => item.active);
  }

  public clear(): void {
    for (const item of this.items) item.active = false;
  }
}

export interface SimInput {
  turrets: Point[];
  pointer: Point | null;
  /** Fire at the pointer. Off on a layer that only draws turrets. */
  fire: boolean;
  pace: PaceConfig;
  /** Shields: windows and widgets (shield mode). Bolts stop at them and a cursor over one can't be hit; `null` lets bolts through. */
  walls: Rect[] | null;
  width: number;
  height: number;
}

export interface SimEvents {
  shots: number;
  hits: number;
  /** Where bolts struck a wall this frame. */
  impacts: Point[];
}

export class TurretsSim {
  public angles: number[] = [];
  public readonly bolts = new Pool<Bolt>(() => ({ active: false, x: 0, y: 0, vx: 0, vy: 0 }), 256);
  public readonly particles = new Pool<Particle>(
    () => ({ active: false, kind: ParticleKind.SPARK, x: 0, y: 0, vx: 0, vy: 0, life: 0, max_life: 0 }),
    512
  );
  private cooldown = 0;
  private turning = false;

  constructor(private readonly rand: () => number = Math.random) {}

  /** Something still moves without input: bolts, particles or turrets catching up with the cursor. */
  public get busy(): boolean {
    return this.turning || this.bolts.any() || this.particles.any();
  }

  public reset(): void {
    this.bolts.clear();
    this.particles.clear();
    this.cooldown = 0;
  }

  public sync(count: number): void {
    while (this.angles.length < count) this.angles.push(-Math.PI / 2);
    this.angles.length = count;
  }

  public aim_all(turrets: Point[], target: Point): void {
    this.sync(turrets.length);
    turrets.forEach((turret, index) => (this.angles[index] = aim_angle(turret, target)));
  }

  public fire(from: Point, target: Point, speed: number, offset = 0): Bolt | null {
    const bolt = this.bolts.take();
    if (!bolt) return null;
    const angle = aim_angle(from, target);
    const start = BARREL_LENGTH + offset;
    bolt.active = true;
    bolt.x = from.x + Math.cos(angle) * start;
    bolt.y = from.y + Math.sin(angle) * start;
    bolt.vx = Math.cos(angle) * speed;
    bolt.vy = Math.sin(angle) * speed;
    return bolt;
  }

  public burst(at: Point, kind: ParticleKind): void {
    const puff = kind === ParticleKind.PUFF;
    const count = puff ? 10 : 8;
    for (let index = 0; index < count; index++) {
      const particle = this.particles.take();
      if (!particle) return;
      const angle = this.rand() * Math.PI * 2;
      const speed = (puff ? 40 : 60) + this.rand() * 100;
      particle.active = true;
      particle.kind = kind;
      particle.x = at.x;
      particle.y = at.y;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
      particle.max_life = puff ? 0.3 : 0.28;
      particle.life = particle.max_life;
    }
  }

  /** One frame: `dt` in seconds, capped so a stalled tab doesn't teleport bolts. */
  public update(dt: number, input: SimInput): SimEvents {
    const step = Math.min(dt, MAX_STEP);
    const events: SimEvents = { shots: 0, hits: 0, impacts: [] };
    const { pointer, turrets } = input;
    const sheltered = pointer !== null && (input.walls?.some((wall) => contains(wall, pointer)) ?? false);
    this.sync(turrets.length);

    this.turning = false;
    if (pointer) {
      for (let index = 0; index < turrets.length; index++) {
        const target = aim_angle(turrets[index], pointer);
        const next = turn_toward(this.angles[index], target, TURN_SPEED * step);
        this.angles[index] = next;
        if (next !== target) this.turning = true;
      }
    }

    if (input.fire && pointer) {
      this.cooldown -= step;
      if (this.cooldown <= 0) {
        const walls = input.walls;
        const shooters = pick_shooters(turrets, pointer, input.pace.volley, this.rand, walls ? (turret) => walls.some((wall) => contains(wall, turret)) : undefined);
        for (const index of shooters) {
          this.angles[index] = aim_angle(turrets[index], pointer);
          if (this.fire(turrets[index], pointer, input.pace.speed)) events.shots++;
        }
        this.cooldown = volley_delay(input.pace, this.rand);
      }
    } else {
      this.cooldown = Math.min(Math.max(this.cooldown, 0), input.pace.interval / 2);
    }

    const margin = BOLT_LENGTH * 2;
    for (const bolt of this.bolts.items) {
      if (!bolt.active) continue;
      const from = { x: bolt.x, y: bolt.y };
      bolt.x += bolt.vx * step;
      bolt.y += bolt.vy * step;
      const to = { x: bolt.x, y: bolt.y };
      const wall = input.walls ? first_wall_hit(from, to, input.walls) : null;
      if (wall) {
        bolt.active = false;
        events.impacts.push(wall);
        this.burst(wall, ParticleKind.SPARK);
      } else if (pointer && !sheltered && segment_distance(from, to, pointer) <= HIT_RADIUS) {
        bolt.active = false;
        this.burst(pointer, ParticleKind.PUFF);
        events.hits++;
      } else if (to.x < -margin || to.y < -margin || to.x > input.width + margin || to.y > input.height + margin) {
        bolt.active = false;
      }
    }

    for (const particle of this.particles.items) {
      if (!particle.active) continue;
      particle.life -= step;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vx *= 0.9;
      particle.vy *= 0.9;
    }

    return events;
  }
}
