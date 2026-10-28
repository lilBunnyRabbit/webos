import { clamp, type Pose, type Vec } from "./geometry";

export const Gear = { PARK: "P", REVERSE: "R", NEUTRAL: "N", DRIVE: "D" } as const;
export type Gear = (typeof Gear)[keyof typeof Gear];

export interface VehicleSpec {
  length: number;
  width: number;
  wheelbase: number;
  rear_overhang: number;
  track: number;
  wheel_diameter: number;
  wheel_width: number;
  /** Kerb to kerb: the radius the outer front wheel draws at full lock. */
  turning_radius: number;
  steer_time: number;
  creep_speed: number;
  creep_accel: number;
  max_forward: number;
  max_reverse: number;
  accel: number;
  brake: number;
  rolling: number;
  park_speed: number;
}

export const HATCHBACK: VehicleSpec = {
  length: 4.3,
  width: 1.8,
  wheelbase: 2.6,
  rear_overhang: 0.8,
  track: 1.55,
  wheel_diameter: 0.62,
  wheel_width: 0.2,
  turning_radius: 5.3,
  steer_time: 1.1,
  creep_speed: 1.8,
  creep_accel: 1.2,
  max_forward: 8.4,
  max_reverse: 2.8,
  accel: 2.4,
  brake: 6.5,
  rolling: 0.3,
  park_speed: 0.3,
};

/** The same car without an automatic's creep: it moves only on the gas, which is easier to place in a tight spot. */
export const NO_CREEP: VehicleSpec = { ...HATCHBACK, creep_accel: 0 };

/** The rear axle's centre is the pose: that's the point a car without tyre slip turns about. */
export interface Car extends Pose {
  speed: number;
  steer: number;
  gear: Gear;
  throttle: number;
  brake: number;
  /** Metres each wheel has rolled, signed (negative in reverse), in `wheels()` order: front left, front right, rear left, rear right. */
  roll: Rolls;
}

export type Rolls = [number, number, number, number];

export interface Input {
  /** Wanted wheel position from -1 (full left) to 1 (full right); null lets go, so the wheel self-centres as the car rolls. */
  steer: number | null;
  throttle: number;
  brake: number;
}

export const NO_INPUT: Input = { steer: null, throttle: 0, brake: 0 };

const PEDAL_RATE = 3;
const RELEASE_RATE = 8;
const STILL = 1e-4;

export function max_steer(spec: VehicleSpec): number {
  const outer = Math.sqrt(spec.turning_radius ** 2 - spec.wheelbase ** 2);
  return Math.atan(spec.wheelbase / (outer - spec.track / 2));
}

export function create_car(pose: Pose, gear: Gear = Gear.PARK): Car {
  return { x: pose.x, y: pose.y, heading: pose.heading, speed: 0, steer: 0, gear, throttle: 0, brake: 0, roll: [0, 0, 0, 0] };
}

export function gear_direction(gear: Gear): -1 | 0 | 1 {
  return gear === Gear.DRIVE ? 1 : gear === Gear.REVERSE ? -1 : 0;
}

/** P only engages near a standstill, like a real box; the other gears change at any speed. */
export function shift(car: Car, gear: Gear, spec: VehicleSpec = HATCHBACK): Car {
  if (gear === car.gear) return car;
  if (gear === Gear.PARK && Math.abs(car.speed) > spec.park_speed) return car;
  return { ...car, gear, speed: gear === Gear.PARK ? 0 : car.speed };
}

function approach(value: number, target: number, rate: number, dt: number): number {
  const delta = target - value;
  const limit = rate * dt;
  return Math.abs(delta) <= limit ? target : value + Math.sign(delta) * limit;
}

function pedal(value: number, target: number, dt: number): number {
  return approach(value, clamp(target, 0, 1), target > value ? PEDAL_RATE : RELEASE_RATE, dt);
}

function steer_target(car: Car, input: Input, limit: number): number {
  if (input.steer !== null) return clamp(input.steer, -1, 1) * limit;
  return Math.abs(car.speed) > STILL ? 0 : car.steer;
}

function steer_rate(car: Car, input: Input, limit: number, spec: VehicleSpec): number {
  const rate = limit / spec.steer_time;
  // Hands off, the caster brings the wheel back only as the car rolls, and faster the faster it rolls.
  if (input.steer === null) return rate * clamp(Math.abs(car.speed) / 2, 0, 1);
  return rate;
}

function acceleration(car: Car, spec: VehicleSpec): number {
  const direction = gear_direction(car.gear);
  if (direction === 0) return 0;
  const along = car.speed * direction;
  const top = direction > 0 ? spec.max_forward : spec.max_reverse;
  const creep = spec.creep_accel * clamp(1 - along / spec.creep_speed, 0, 2);
  const push = spec.accel * car.throttle * clamp(1 - along / top, 0, 1);
  return direction * Math.max(creep, push);
}

function resistance(car: Car, spec: VehicleSpec): number {
  if (car.gear === Gear.PARK) return Infinity;
  return spec.rolling + spec.brake * car.brake;
}

/**
 * One fixed step of the kinematic Ackermann (bicycle) model: no tyre slip, so the rear axle only moves along the
 * heading and the car turns about a point on the rear axle line. The arc is integrated exactly for the step.
 */
export function step(car: Car, input: Input, dt: number, spec: VehicleSpec = HATCHBACK): Car {
  if (!(dt > 0)) return car;
  const limit = max_steer(spec);
  const steer = approach(car.steer, steer_target(car, input, limit), steer_rate(car, input, limit, spec), dt);
  const next: Car = { ...car, steer, throttle: pedal(car.throttle, input.throttle, dt), brake: pedal(car.brake, input.brake, dt) };

  const driven = car.speed + acceleration(next, spec) * dt;
  const resist = resistance(next, spec) * dt;
  const speed = Math.abs(driven) <= resist ? 0 : driven - Math.sign(driven) * resist;
  const distance = ((car.speed + speed) / 2) * dt;

  const curvature = Math.tan(steer) / spec.wheelbase;
  return { ...next, ...arc(car, curvature, distance), speed, roll: roll(car.roll, curvature, distance, spec) };
}

/**
 * Each wheel rolls along its own circle about the turn centre, so on lock the outer front wheel covers the most ground.
 * A wheel at (x, y) from the rear axle's centre turns on a radius |κ|·hypot(x, 1/κ − y) times the axle centre's.
 */
export function roll(rolls: Rolls, curvature: number, distance: number, spec: VehicleSpec = HATCHBACK): Rolls {
  const half = spec.track / 2;
  const ratio = (x: number, y: number) => Math.hypot(x * curvature, 1 - y * curvature);
  return [
    rolls[0] + distance * ratio(spec.wheelbase, -half),
    rolls[1] + distance * ratio(spec.wheelbase, half),
    rolls[2] + distance * ratio(0, -half),
    rolls[3] + distance * ratio(0, half),
  ];
}

export function to_world(pose: Pose, local: Vec): Vec {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: pose.x + cos * local.x - sin * local.y, y: pose.y + sin * local.x + cos * local.y };
}

export function body_local(spec: VehicleSpec = HATCHBACK): Vec[] {
  const front = spec.length - spec.rear_overhang;
  const rear = -spec.rear_overhang;
  const half = spec.width / 2;
  return [
    { x: front, y: -half },
    { x: front, y: half },
    { x: rear, y: half },
    { x: rear, y: -half },
  ];
}

export function corners(pose: Pose, spec: VehicleSpec = HATCHBACK): Vec[] {
  return body_local(spec).map((point) => to_world(pose, point));
}

export function pose_from_centre(centre: Pose, spec: VehicleSpec = HATCHBACK): Pose {
  const back = spec.length / 2 - spec.rear_overhang;
  return { x: centre.x - Math.cos(centre.heading) * back, y: centre.y - Math.sin(centre.heading) * back, heading: centre.heading };
}

export function body_centre(pose: Pose, spec: VehicleSpec = HATCHBACK): Vec {
  return to_world(pose, { x: spec.length / 2 - spec.rear_overhang, y: 0 });
}

export interface Wheel {
  at: Vec;
  angle: number;
}

export function wheels(car: Car, spec: VehicleSpec = HATCHBACK): Wheel[] {
  const half = spec.track / 2;
  const curvature = Math.tan(car.steer) / spec.wheelbase;
  const angle = (side: number) => (Math.abs(curvature) < 1e-9 ? 0 : Math.atan(spec.wheelbase / (1 / curvature - side)));
  return [
    { at: to_world(car, { x: spec.wheelbase, y: -half }), angle: angle(-half) },
    { at: to_world(car, { x: spec.wheelbase, y: half }), angle: angle(half) },
    { at: to_world(car, { x: 0, y: -half }), angle: 0 },
    { at: to_world(car, { x: 0, y: half }), angle: 0 },
  ];
}

export function turn_centre(car: Car, spec: VehicleSpec = HATCHBACK): Vec | null {
  const curvature = Math.tan(car.steer) / spec.wheelbase;
  if (Math.abs(curvature) < 1e-9) return null;
  return to_world(car, { x: 0, y: 1 / curvature });
}

export function sweep(car: Car, distance: number, samples: number, spec: VehicleSpec = HATCHBACK): Vec[][] {
  const curvature = Math.tan(car.steer) / spec.wheelbase;
  const local = body_local(spec);
  const paths: Vec[][] = local.map(() => []);
  for (let i = 0; i <= samples; i++) {
    const s = (distance * i) / samples;
    const pose = arc(car, curvature, s);
    local.forEach((point, k) => paths[k].push(to_world(pose, point)));
  }
  return paths;
}

export function arc(pose: Pose, curvature: number, distance: number): Pose {
  if (Math.abs(curvature * distance) < 1e-9) {
    return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
  }
  const heading = pose.heading + curvature * distance;
  return {
    x: pose.x + (Math.sin(heading) - Math.sin(pose.heading)) / curvature,
    y: pose.y + (Math.cos(pose.heading) - Math.cos(heading)) / curvature,
    heading,
  };
}
