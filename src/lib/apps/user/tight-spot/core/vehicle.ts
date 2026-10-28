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

export const DriveKind = { ACKERMANN: "ackermann" } as const;
export type DriveKind = (typeof DriveKind)[keyof typeof DriveKind];

export const SteerAxle = { FRONT: "front", REAR: "rear" } as const;
export type SteerAxle = (typeof SteerAxle)[keyof typeof SteerAxle];

export interface AckermannDrive {
  kind: typeof DriveKind.ACKERMANN;
  steer_axle: SteerAxle;
}

export type Drive = AckermannDrive;

export const FRONT_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.FRONT };
export const REAR_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.REAR };

export interface VehicleSpec {
  drive: Drive;
  length: number;
  width: number;
  wheelbase: number;
  rear_overhang: number;
  track: number;
  wheel_diameter: number;
  wheel_width: number;
  /** Kerb to kerb: the radius the outer steered wheel draws at full lock. */
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
  /** Tines out ahead of the body; they collide like the body except where a game lets them into a pallet. */
  forks?: Forks;
  /** Beeps whenever it backs up, like site machinery. */
  reverse_beeper?: boolean;
}

export interface Forks {
  length: number;
  /** Across both tines, outside to outside. */
  width: number;
}

export const HATCHBACK: VehicleSpec = {
  drive: FRONT_STEER,
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
  drive: FRONT_STEER,
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
  drive: FRONT_STEER,
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
  drive: FRONT_STEER,
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

// Counterbalance forklift: the counterweight behind the steered rear axle swings wide, the forks barely move.
export const FORKLIFT: VehicleSpec = {
  drive: REAR_STEER,
  length: 2.5,
  width: 1.2,
  wheelbase: 1.5,
  rear_overhang: 0.55,
  track: 1.0,
  wheel_diameter: 0.56,
  wheel_width: 0.24,
  turning_radius: 1.68,
  steer_time: 1.05,
  creep_speed: 0.9,
  creep_accel: 0.8,
  max_forward: 3,
  max_reverse: 2.4,
  accel: 1.8,
  brake: 4,
  rolling: 0.3,
  park_speed: 0.3,
  forks: { length: 1.2, width: 0.86 },
  reverse_beeper: true,
};

export const CITY_CAR: VehicleSpec = {
  ...HATCHBACK,
  length: 3.6,
  width: 1.65,
  wheelbase: 2.38,
  rear_overhang: 0.55,
  track: 1.42,
  wheel_diameter: 0.58,
  wheel_width: 0.18,
  turning_radius: 4.8,
  steer_time: 1,
};

export const SUV: VehicleSpec = {
  ...HATCHBACK,
  length: 4.75,
  width: 1.95,
  wheelbase: 2.85,
  rear_overhang: 1.0,
  track: 1.65,
  wheel_diameter: 0.74,
  wheel_width: 0.25,
  turning_radius: 5.9,
  steer_time: 1.15,
  accel: 2.3,
};

export const LIMO: VehicleSpec = {
  ...HATCHBACK,
  length: 8.2,
  width: 1.95,
  wheelbase: 5.1,
  rear_overhang: 1.25,
  track: 1.65,
  wheel_diameter: 0.7,
  wheel_width: 0.24,
  turning_radius: 8.8,
  steer_time: 1.4,
  creep_speed: 1.5,
  creep_accel: 0.9,
  max_forward: 7.5,
  max_reverse: 2.4,
  accel: 1.8,
};

export const CAMPER: VehicleSpec = {
  ...VAN,
  length: 6.6,
  width: 2.1,
  wheelbase: 4.0,
  rear_overhang: 1.55,
  track: 1.75,
  wheel_diameter: 0.72,
  wheel_width: 0.23,
  turning_radius: 7.2,
  steer_time: 1.3,
  max_forward: 7.5,
  accel: 1.8,
};

const TRUCK = {
  drive: FRONT_STEER,
  width: 2.5,
  track: 2.05,
  wheel_diameter: 1,
  wheel_width: 0.32,
  creep_speed: 1.4,
  creep_accel: 0.8,
  max_forward: 6.5,
  max_reverse: 2,
  accel: 1.3,
  brake: 5,
  rolling: 0.3,
  park_speed: 0.25,
};

export const GARBAGE_TRUCK: VehicleSpec = {
  ...TRUCK,
  length: 9.4,
  wheelbase: 4.5,
  rear_overhang: 2.8,
  turning_radius: 9,
  steer_time: 1.5,
};

export const FIRE_ENGINE: VehicleSpec = {
  ...TRUCK,
  length: 8.8,
  wheelbase: 4.2,
  rear_overhang: 2.3,
  turning_radius: 8.6,
  steer_time: 1.45,
  max_forward: 7,
  accel: 1.4,
};

/** Its tag axle trails the drive axle; the pose sits between the two, where a rigid pair turns without slip. */
export const COACH: VehicleSpec = {
  ...BUS,
  length: 13.7,
  wheelbase: 7,
  rear_overhang: 4,
  turning_radius: 12,
  steer_time: 1.7,
  max_forward: 7,
  max_reverse: 2,
  accel: 1.3,
};

export const DOUBLE_DECKER: VehicleSpec = {
  ...BUS,
  length: 11.2,
  rear_overhang: 2.9,
  turning_radius: 10.5,
  accel: 1.2,
};

export const TRACTOR: VehicleSpec = {
  drive: FRONT_STEER,
  length: 4.1,
  width: 2.25,
  wheelbase: 2.5,
  rear_overhang: 0.8,
  track: 1.8,
  wheel_diameter: 1.45,
  wheel_width: 0.45,
  turning_radius: 5.4,
  steer_time: 1.3,
  creep_speed: 1.2,
  creep_accel: 0.9,
  max_forward: 5,
  max_reverse: 2,
  accel: 1.6,
  brake: 5.5,
  rolling: 0.4,
  park_speed: 0.3,
};

export const QUAD: VehicleSpec = {
  drive: FRONT_STEER,
  length: 2.1,
  width: 1.2,
  wheelbase: 1.3,
  rear_overhang: 0.35,
  track: 0.95,
  wheel_diameter: 0.6,
  wheel_width: 0.24,
  turning_radius: 3.2,
  steer_time: 0.9,
  creep_speed: 1.5,
  creep_accel: 1.2,
  max_forward: 6,
  max_reverse: 2,
  accel: 2.4,
  brake: 6.5,
  rolling: 0.35,
  park_speed: 0.3,
};

const HORSE_BOX: TrailerSpec = {
  hitch: 1.1,
  axle: 3.3,
  drawbar: 1.4,
  box_length: 3.9,
  width: 1.95,
  track: 1.7,
  wheel_diameter: 0.6,
  wheel_width: 0.18,
};

const FARM_TRAILER: TrailerSpec = {
  hitch: 1.0,
  axle: 3.6,
  drawbar: 1.5,
  box_length: 4.4,
  width: 2.3,
  track: 1.85,
  wheel_diameter: 0.9,
  wheel_width: 0.35,
};

const SMALL_TRAILER: TrailerSpec = {
  hitch: 0.45,
  axle: 1.5,
  drawbar: 0.8,
  box_length: 1.3,
  width: 1.0,
  track: 1.15,
  wheel_diameter: 0.42,
  wheel_width: 0.13,
};

const BOAT_TRAILER: TrailerSpec = {
  hitch: 1.0,
  axle: 4.0,
  drawbar: 1.0,
  box_length: 5.6,
  width: 1.9,
  track: 1.75,
  wheel_diameter: 0.55,
  wheel_width: 0.17,
};

export const CARAVAN_TRAILER: TrailerSpec = {
  hitch: 1.0,
  axle: 4.8,
  drawbar: 1.2,
  box_length: 5.8,
  width: 2.3,
  track: 2.0,
  wheel_diameter: 0.6,
  wheel_width: 0.19,
};

/** An articulated bus's rear section is a trailer: the turntable is the ball, the bellows the drawbar. */
const BUS_REAR: TrailerSpec = {
  hitch: 1.7,
  axle: 6.0,
  drawbar: 0.65,
  box_length: 7.15,
  width: 2.55,
  track: 2.1,
  wheel_diameter: 1,
  wheel_width: 0.3,
};

const TOWING = { max_forward: 6, max_reverse: 2.1, accel: 1.8 };

export const HORSE_BOX_RIG: VehicleSpec = { ...SUV, ...TOWING, trailer: HORSE_BOX };
export const TRACTOR_RIG: VehicleSpec = { ...TRACTOR, accel: 1.4, trailer: FARM_TRAILER };
export const QUAD_RIG: VehicleSpec = { ...QUAD, max_forward: 5, max_reverse: 1.8, accel: 2, trailer: SMALL_TRAILER };
export const BOAT_RIG: VehicleSpec = { ...PICKUP, ...TOWING, trailer: BOAT_TRAILER };
export const CARAVAN_RIG: VehicleSpec = { ...HATCHBACK, ...TOWING, max_forward: 5.5, accel: 1.6, trailer: CARAVAN_TRAILER };

export const ARTICULATED_BUS: VehicleSpec = {
  ...BUS,
  length: 10.35,
  rear_overhang: 1.75,
  steer_time: 1.7,
  max_forward: 6.5,
  max_reverse: 2,
  accel: 1.2,
  trailer: BUS_REAR,
};

export const Vehicle = {
  HATCH: "hatch",
  VAN: "van",
  PICKUP: "pickup",
  BUS: "bus",
  TOWING: "towing",
  FORKLIFT: "forklift",
  CITY: "city",
  SUV: "suv",
  LIMO: "limo",
  CAMPER: "camper",
  TAXI: "taxi",
  POLICE: "police",
  AMBULANCE: "ambulance",
  GARBAGE: "garbage",
  FIRE: "fire",
  COACH: "coach",
  DECKER: "decker",
  ARTIC: "artic",
  HORSE_BOX: "horse-box",
  TRACTOR: "tractor",
  QUAD: "quad",
  BOAT: "boat",
  CARAVAN: "caravan",
} as const;
export type Vehicle = (typeof Vehicle)[keyof typeof Vehicle];

/** The taxi, the police car and the ambulance are looks: another vehicle's spec under their own livery. */
export const VEHICLES: Record<Vehicle, VehicleSpec> = {
  hatch: HATCHBACK,
  van: VAN,
  pickup: PICKUP,
  bus: BUS,
  towing: HATCH_TRAILER,
  forklift: FORKLIFT,
  city: CITY_CAR,
  suv: SUV,
  limo: LIMO,
  camper: CAMPER,
  taxi: HATCHBACK,
  police: SUV,
  ambulance: VAN,
  garbage: GARBAGE_TRUCK,
  fire: FIRE_ENGINE,
  coach: COACH,
  decker: DOUBLE_DECKER,
  artic: ARTICULATED_BUS,
  "horse-box": HORSE_BOX_RIG,
  tractor: TRACTOR_RIG,
  quad: QUAD_RIG,
  boat: BOAT_RIG,
  caravan: CARAVAN_RIG,
};

export const VEHICLE_NAMES: Record<Vehicle, string> = {
  hatch: "Hatchback",
  van: "Van",
  pickup: "Pickup",
  bus: "City bus",
  towing: "Car and trailer",
  forklift: "Forklift",
  city: "City car",
  suv: "SUV",
  limo: "Limousine",
  camper: "Camper van",
  taxi: "Taxi",
  police: "Police car",
  ambulance: "Ambulance",
  garbage: "Garbage truck",
  fire: "Fire engine",
  coach: "Coach",
  decker: "Double-decker",
  artic: "Articulated bus",
  "horse-box": "Car and horse box",
  tractor: "Tractor and trailer",
  quad: "Quad and trailer",
  boat: "Pickup and boat",
  caravan: "Car and caravan",
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

/**
 * The pose is the centre of the axle that doesn't steer (a car's rear axle, a forklift's front one): without tyre slip
 * that point only moves along the heading, and the vehicle turns about a point on that axle's line.
 */
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
 * One fixed step of the kinematic Ackermann (bicycle) model: no tyre slip, so the unsteered axle only moves along the
 * heading and the vehicle turns about a point on that axle's line. A positive wheel turns right on either drive:
 * steered at the rear, the rear wheels point left and the tail swings out. The arc is integrated exactly for the step;
 * a trailer follows it about the tow ball.
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

export function fork_corners(pose: Pose, spec: VehicleSpec): Vec[] | null {
  if (!spec.forks) return null;
  const heel = body_ends(spec).front;
  const tip = heel + spec.forks.length;
  const half = spec.forks.width / 2;
  return [
    { x: tip, y: -half },
    { x: tip, y: half },
    { x: heel, y: half },
    { x: heel, y: -half },
  ].map((point) => to_world(pose, point));
}

/** The body first, then the forks, then a trailer's box. */
export function bodies(car: Placement, spec: VehicleSpec = HATCHBACK): Vec[][] {
  const found = [corners(car, spec)];
  const forks = fork_corners(car, spec);
  if (forks) found.push(forks);
  if (spec.trailer) found.push(trailer_corners(car, spec.trailer));
  return found;
}

export function axles(spec: VehicleSpec): { front: number; rear: number } {
  return spec.drive.steer_axle === SteerAxle.REAR ? { front: 0, rear: -spec.wheelbase } : { front: spec.wheelbase, rear: 0 };
}

export function body_ends(spec: VehicleSpec): { front: number; rear: number } {
  const rear = axles(spec).rear - spec.rear_overhang;
  return { front: rear + spec.length, rear };
}

/** The whole rig's ends from the pose: fork tips at the front, a trailer's tail at the back. */
export function rig_ends(spec: VehicleSpec): { front: number; rear: number } {
  const { front, rear } = body_ends(spec);
  const t = spec.trailer;
  return { front: front + (spec.forks?.length ?? 0), rear: t ? -(t.hitch + t.drawbar + t.box_length) : rear };
}

export function rig_length(spec: VehicleSpec): number {
  const { front, rear } = rig_ends(spec);
  return front - rear;
}

/**
 * Each wheel rolls along its own circle about the turn centre, so on lock the outer steered wheel covers the most
 * ground. A wheel at (x, y) from the pose turns on a radius |κ|·hypot(x, 1/κ − y) times the pose's.
 */
export function roll(rolls: Rolls, curvature: number, distance: number, spec: VehicleSpec = HATCHBACK): Rolls {
  const half = spec.track / 2;
  const { front, rear } = axles(spec);
  const ratio = (x: number, y: number) => Math.hypot(x * curvature, 1 - y * curvature);
  return [
    rolls[0] + distance * ratio(front, -half),
    rolls[1] + distance * ratio(front, half),
    rolls[2] + distance * ratio(rear, -half),
    rolls[3] + distance * ratio(rear, half),
  ];
}

export function to_world(pose: Pose, local: Vec): Vec {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: pose.x + cos * local.x - sin * local.y, y: pose.y + sin * local.x + cos * local.y };
}

export function body_local(spec: VehicleSpec = HATCHBACK): Vec[] {
  const { front, rear } = body_ends(spec);
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
  const { front, rear } = rig_ends(spec);
  const back = (front + rear) / 2;
  return {
    x: centre.x - Math.cos(centre.heading) * back,
    y: centre.y - Math.sin(centre.heading) * back,
    heading: centre.heading,
  };
}

export function body_centre(pose: Pose, spec: VehicleSpec = HATCHBACK): Vec {
  return to_world(pose, { x: body_ends(spec).rear + spec.length / 2, y: 0 });
}

export interface Wheel {
  at: Vec;
  angle: number;
}

export function wheels(car: Car, spec: VehicleSpec = HATCHBACK): Wheel[] {
  const half = spec.track / 2;
  const curvature = Math.tan(car.steer) / spec.wheelbase;
  const rear_steer = spec.drive.steer_axle === SteerAxle.REAR;
  const { front, rear } = axles(spec);
  // atan2, not atan: a forklift's turn centre lies inside its track, so its inner wheel turns past 90°.
  const angle = (x: number, side: number, steered: boolean) =>
    !steered || Math.abs(curvature) < 1e-9 ? 0 : Math.atan2(x * curvature, 1 - side * curvature);
  return [
    { at: to_world(car, { x: front, y: -half }), angle: angle(front, -half, !rear_steer) },
    { at: to_world(car, { x: front, y: half }), angle: angle(front, half, !rear_steer) },
    { at: to_world(car, { x: rear, y: -half }), angle: angle(rear, -half, rear_steer) },
    { at: to_world(car, { x: rear, y: half }), angle: angle(rear, half, rear_steer) },
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
