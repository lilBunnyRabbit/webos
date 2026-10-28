import { clamp, wrap_angle, type Pose, type Vec } from "./geometry";

export const Gear = { PARK: "P", REVERSE: "R", NEUTRAL: "N", DRIVE: "D" } as const;
export type Gear = (typeof Gear)[keyof typeof Gear];

export interface TrailerSpec {
  /** Rear axle to the tow ball. */
  hitch: number;
  /** Tow ball to the trailer's axle, the point the trailer turns about. */
  axle: number;
  /** Tow ball to the front of the box. */
  drawbar: number;
  box_length: number;
  width: number;
  track: number;
  wheel_diameter: number;
  wheel_width: number;
}

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
  /** Centre to lock at a steady hold; the wheel itself can go `STEER_BOOST` times faster. */
  steer_time: number;
  creep_speed: number;
  creep_accel: number;
  max_forward: number;
  max_reverse: number;
  accel: number;
  brake: number;
  rolling: number;
  park_speed: number;
  trailer?: TrailerSpec;
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

export const VAN: VehicleSpec = {
  length: 5.9,
  width: 2.0,
  wheelbase: 3.7,
  rear_overhang: 1.2,
  track: 1.72,
  wheel_diameter: 0.7,
  wheel_width: 0.22,
  turning_radius: 6.6,
  steer_time: 1.2,
  creep_speed: 1.6,
  creep_accel: 1.0,
  max_forward: 8,
  max_reverse: 2.6,
  accel: 2,
  brake: 6,
  rolling: 0.3,
  park_speed: 0.3,
};

export const PICKUP: VehicleSpec = {
  length: 5.3,
  width: 1.9,
  wheelbase: 3.2,
  rear_overhang: 1.2,
  track: 1.62,
  wheel_diameter: 0.76,
  wheel_width: 0.26,
  turning_radius: 6.3,
  steer_time: 1.15,
  creep_speed: 1.7,
  creep_accel: 1.1,
  max_forward: 8.4,
  max_reverse: 2.7,
  accel: 2.2,
  brake: 6.3,
  rolling: 0.3,
  park_speed: 0.3,
};

export const BUS: VehicleSpec = {
  length: 12,
  width: 2.55,
  wheelbase: 5.9,
  rear_overhang: 3.6,
  track: 2.1,
  wheel_diameter: 1,
  wheel_width: 0.3,
  turning_radius: 11,
  steer_time: 1.6,
  creep_speed: 1.4,
  creep_accel: 0.8,
  max_forward: 7,
  max_reverse: 2.2,
  accel: 1.4,
  brake: 5,
  rolling: 0.3,
  park_speed: 0.25,
};

const BOX_TRAILER: TrailerSpec = {
  hitch: 1.0,
  axle: 2.45,
  drawbar: 1.1,
  box_length: 2.5,
  width: 1.6,
  track: 1.45,
  wheel_diameter: 0.52,
  wheel_width: 0.16,
};

export const HATCH_TRAILER: VehicleSpec = {
  ...HATCHBACK,
  max_forward: 6.5,
  max_reverse: 2.2,
  accel: 1.9,
  trailer: BOX_TRAILER,
};

export const Vehicle = { HATCH: "hatch", VAN: "van", PICKUP: "pickup", BUS: "bus", TOWING: "towing" } as const;
export type Vehicle = (typeof Vehicle)[keyof typeof Vehicle];

export const VEHICLES: Record<Vehicle, VehicleSpec> = {
  hatch: HATCHBACK,
  van: VAN,
  pickup: PICKUP,
  bus: BUS,
  towing: HATCH_TRAILER,
};

export const VEHICLE_NAMES: Record<Vehicle, string> = {
  hatch: "Hatchback",
  van: "Van",
  pickup: "Pickup",
  bus: "City bus",
  towing: "Car and trailer",
};

const coasting = new WeakMap<VehicleSpec, VehicleSpec>();

/** Without an automatic's creep the vehicle moves only on the gas, which is easier to place in a tight spot. */
export function without_creep(spec: VehicleSpec): VehicleSpec {
  let found = coasting.get(spec);
  if (!found) {
    found = { ...spec, creep_accel: 0 };
    coasting.set(spec, found);
  }
  return found;
}

const JACKKNIFE_ANGLE = (70 * Math.PI) / 180;

/** The rear axle's centre is the pose: that's the point a car without tyre slip turns about. */
export interface Car extends Pose {
  speed: number;
  steer: number;
  gear: Gear;
  throttle: number;
  brake: number;
  /** Metres each wheel has rolled, signed (negative in reverse), in `wheels()` order: front left, front right, rear left, rear right. */
  roll: Rolls;
  trailer?: Trailer;
}

export interface Trailer {
  /** From its axle toward the tow ball. */
  heading: number;
  roll: [number, number];
}

export type Placement = Pick<Car, "x" | "y" | "heading" | "trailer">;

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

/** How much faster than a steady hold the wheel turns at most: a hatchback goes centre to lock in about 0.7 s. */
export const STEER_BOOST = 1.6;
const BOOST_AFTER = 0.25;
const BOOST_RAMP = 0.3;

/**
 * A held steering key's rate over the steady one. Only winding the wheel back from the other side speeds up: held that
 * way for more than a short while, it eases up to `STEER_BOOST` over about 0.3 s. Turning further toward a side, and
 * any tap, keeps the fine rate.
 */
export function steer_boost(held: number, against: boolean): number {
  if (!against) return 1;
  const t = clamp((held - BOOST_AFTER) / BOOST_RAMP, 0, 1);
  return 1 + (STEER_BOOST - 1) * t * t * (3 - 2 * t);
}

export function max_steer(spec: VehicleSpec): number {
  const outer = Math.sqrt(spec.turning_radius ** 2 - spec.wheelbase ** 2);
  return Math.atan(spec.wheelbase / (outer - spec.track / 2));
}

export function create_car(pose: Pose, gear: Gear = Gear.PARK, spec: VehicleSpec = HATCHBACK): Car {
  const car: Car = {
    x: pose.x,
    y: pose.y,
    heading: pose.heading,
    speed: 0,
    steer: 0,
    gear,
    throttle: 0,
    brake: 0,
    roll: [0, 0, 0, 0],
  };
  return spec.trailer ? { ...car, trailer: { heading: pose.heading, roll: [0, 0] } } : car;
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
  return rate * STEER_BOOST;
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
 * heading and the car turns about a point on the rear axle line. The arc is integrated exactly for the step; a
 * trailer follows it about the tow ball.
 */
export function step(car: Car, input: Input, dt: number, spec: VehicleSpec = HATCHBACK): Car {
  if (!(dt > 0)) return car;
  const limit = max_steer(spec);
  const steer = approach(car.steer, steer_target(car, input, limit), steer_rate(car, input, limit, spec), dt);
  const next: Car = {
    ...car,
    steer,
    throttle: pedal(car.throttle, input.throttle, dt),
    brake: pedal(car.brake, input.brake, dt),
  };

  const driven = car.speed + acceleration(next, spec) * dt;
  const resist = resistance(next, spec) * dt;
  const speed = Math.abs(driven) <= resist ? 0 : driven - Math.sign(driven) * resist;
  const distance = ((car.speed + speed) / 2) * dt;

  const curvature = Math.tan(steer) / spec.wheelbase;
  const moved: Car = {
    ...next,
    ...arc(car, curvature, distance),
    speed,
    roll: roll(car.roll, curvature, distance, spec),
  };
  if (!spec.trailer || !car.trailer) return moved;
  return { ...moved, trailer: tow(car, car.trailer, curvature, distance, spec.trailer) };
}

const TOW_STEP = 0.025;

/**
 * The trailer behind a car that drives `distance` along an arc of `curvature` from `pose`. With ψ = θ − φ the hitch
 * angle, h the ball behind the rear axle and Lt the ball to the trailer's axle, per metre the car covers:
 * dφ/ds = (sin ψ − h·κ·cos ψ) / Lt, and the trailer's axle covers cos ψ + h·κ·sin ψ. The car's heading along the arc
 * is exact, so RK4 in steps of at most 2.5 cm stays far inside the tolerances that matter, even reversing, which
 * amplifies every error.
 */
export function tow(pose: Pose, trailer: Trailer, curvature: number, distance: number, spec: TrailerSpec): Trailer {
  if (distance === 0) return trailer;
  const slope = (s: number, phi: number): [number, number] => {
    const psi = pose.heading + curvature * s - phi;
    const sin = Math.sin(psi);
    const cos = Math.cos(psi);
    return [(sin - spec.hitch * curvature * cos) / spec.axle, cos + spec.hitch * curvature * sin];
  };
  const pieces = Math.max(1, Math.ceil(Math.abs(distance) / TOW_STEP));
  const ds = distance / pieces;
  let phi = trailer.heading;
  let along = 0;
  for (let i = 0; i < pieces; i++) {
    const s = i * ds;
    const k1 = slope(s, phi);
    const k2 = slope(s + ds / 2, phi + (ds / 2) * k1[0]);
    const k3 = slope(s + ds / 2, phi + (ds / 2) * k2[0]);
    const k4 = slope(s + ds, phi + ds * k3[0]);
    phi += (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    along += (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }
  // The left wheel (−y) sits outside a right turn: it covers the axle's distance plus half a track times the turn.
  const turned = phi - trailer.heading;
  const half = spec.track / 2;
  return { heading: phi, roll: [trailer.roll[0] + along + half * turned, trailer.roll[1] + along - half * turned] };
}

export function hitch_angle(car: Placement): number {
  return car.trailer ? wrap_angle(car.heading - car.trailer.heading) : 0;
}

export function jackknifed(car: Placement): boolean {
  return Math.abs(hitch_angle(car)) > JACKKNIFE_ANGLE;
}

export function hitch_point(pose: Pose, spec: TrailerSpec): Vec {
  return to_world(pose, { x: -spec.hitch, y: 0 });
}

export function trailer_pose(car: Placement, spec: TrailerSpec): Pose {
  const ball = hitch_point(car, spec);
  const heading = car.trailer?.heading ?? car.heading;
  return { x: ball.x - Math.cos(heading) * spec.axle, y: ball.y - Math.sin(heading) * spec.axle, heading };
}

function trailer_local(spec: TrailerSpec): Vec[] {
  const front = spec.axle - spec.drawbar;
  const rear = front - spec.box_length;
  const half = spec.width / 2;
  return [
    { x: front, y: -half },
    { x: front, y: half },
    { x: rear, y: half },
    { x: rear, y: -half },
  ];
}

export function trailer_corners(car: Placement, spec: TrailerSpec): Vec[] {
  const pose = trailer_pose(car, spec);
  return trailer_local(spec).map((point) => to_world(pose, point));
}

export function trailer_wheels(car: Placement, spec: TrailerSpec): Vec[] {
  const pose = trailer_pose(car, spec);
  return [to_world(pose, { x: 0, y: -spec.track / 2 }), to_world(pose, { x: 0, y: spec.track / 2 })];
}

export function bodies(car: Placement, spec: VehicleSpec = HATCHBACK): Vec[][] {
  const body = corners(car, spec);
  return spec.trailer ? [body, trailer_corners(car, spec.trailer)] : [body];
}

function rig_extent(spec: VehicleSpec): { front: number; rear: number } {
  const front = spec.length - spec.rear_overhang;
  const t = spec.trailer;
  return { front, rear: t ? -(t.hitch + t.drawbar + t.box_length) : -spec.rear_overhang };
}

export function rig_length(spec: VehicleSpec): number {
  const { front, rear } = rig_extent(spec);
  return front - rear;
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
  const { front, rear } = rig_extent(spec);
  const back = (front + rear) / 2;
  return {
    x: centre.x - Math.cos(centre.heading) * back,
    y: centre.y - Math.sin(centre.heading) * back,
    heading: centre.heading,
  };
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

// Reversing, the trailer's tail leads: its corners show the trailer folding away well before it does.
export function trailer_sweep(car: Car, distance: number, samples: number, vehicle: VehicleSpec): Vec[][] {
  const spec = vehicle.trailer!;
  const curvature = Math.tan(car.steer) / vehicle.wheelbase;
  const local = trailer_local(spec).slice(2);
  const paths: Vec[][] = local.map(() => []);
  let pose: Pose = car;
  let trailer: Trailer = car.trailer ?? { heading: car.heading, roll: [0, 0] };
  for (let i = 0; i <= samples; i++) {
    const placed = trailer_pose({ ...pose, trailer }, spec);
    local.forEach((point, k) => paths[k].push(to_world(placed, point)));
    if (Math.abs(wrap_angle(pose.heading - trailer.heading)) > JACKKNIFE_ANGLE) break;
    const ds = distance / samples;
    trailer = tow(pose, trailer, curvature, ds, spec);
    pose = arc(pose, curvature, ds);
  }
  return paths;
}

export function arc(pose: Pose, curvature: number, distance: number): Pose {
  if (Math.abs(curvature * distance) < 1e-9) {
    return {
      x: pose.x + Math.cos(pose.heading) * distance,
      y: pose.y + Math.sin(pose.heading) * distance,
      heading: pose.heading,
    };
  }
  const heading = pose.heading + curvature * distance;
  return {
    x: pose.x + (Math.sin(heading) - Math.sin(pose.heading)) / curvature,
    y: pose.y + (Math.cos(pose.heading) - Math.cos(heading)) / curvature,
    heading,
  };
}
