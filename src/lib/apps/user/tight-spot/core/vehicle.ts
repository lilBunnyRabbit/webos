import { clamp, wrap_angle, type Pose, type Vec } from "./geometry";
import type { Signal } from "./signal";

export const Gear = { PARK: "P", REVERSE: "R", NEUTRAL: "N", DRIVE: "D" } as const;
export type Gear = (typeof Gear)[keyof typeof Gear];

export interface TrailerSpec {
  /** The body ahead's axle (the vehicle's pose for the first link) back to the hinge; negative ahead of it, like a kingpin. */
  hitch: number;
  /** Hinge to the trailer's axle, the point the trailer turns about. */
  axle: number;
  /** Hinge to the front of the box; negative when the box reaches past the hinge, like a semi-trailer's. */
  drawbar: number;
  box_length: number;
  width: number;
  track: number;
  wheel_diameter: number;
  wheel_width: number;
  max_angle: number;
  /** The hinge angle the link hangs at, which `max_angle` is measured from: 0 (the default) trails behind the body ahead, π hangs ahead of it, like a towbar off a pushback tug's front. */
  rest?: number;
}

export const DriveKind = { ACKERMANN: "ackermann", SKID: "skid", FRAME: "frame" } as const;
export type DriveKind = (typeof DriveKind)[keyof typeof DriveKind];

/** `all`: the rear wheels counter-steer for a tighter circle; `crab`: the same, plus a crab mode (`Car.crab`) in which both axles steer one way. */
export const SteerAxle = { FRONT: "front", REAR: "rear", ALL: "all", CRAB: "crab" } as const;
export type SteerAxle = (typeof SteerAxle)[keyof typeof SteerAxle];

export interface AckermannDrive {
  kind: typeof DriveKind.ACKERMANN;
  steer_axle: SteerAxle;
}

export interface SkidDrive {
  kind: typeof DriveKind.SKID;
  /** The track the turn feels: wider than the wheels' or the tracks', since they scrub sideways as it turns. */
  track: number;
}

export interface FrameDrive {
  kind: typeof DriveKind.FRAME;
  /** Front axle back to the joint. */
  pivot: number;
}

export type Drive = AckermannDrive | SkidDrive | FrameDrive;

export const FRONT_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.FRONT };
export const REAR_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.REAR };
export const ALL_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.ALL };
export const CRAB_STEER: AckermannDrive = { kind: DriveKind.ACKERMANN, steer_axle: SteerAxle.CRAB };

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
  hitches: TrailerSpec[];
  /** Tines out ahead of the body; they collide like the body except where a game lets them into a pallet. */
  forks?: Forks;
  /** Beeps whenever it backs up, like site machinery. */
  reverse_beeper?: boolean;
  /** No lamps, so no headlight beams either. */
  unlit?: boolean;
  /** The sideways acceleration the tyres hold (m/s²); `step()` keeps the turn within a_lat / v². Absent, any lock at any speed. */
  a_lat?: number;
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
  hitches: [],
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
  hitches: [],
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
  hitches: [],
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
  hitches: [],
};

const degrees = (angle: number) => (angle * Math.PI) / 180;
const BALL = degrees(70);

const BOX_TRAILER: TrailerSpec = {
  hitch: 1.0,
  axle: 2.45,
  drawbar: 1.1,
  box_length: 2.5,
  width: 1.6,
  track: 1.45,
  wheel_diameter: 0.52,
  wheel_width: 0.16,
  max_angle: BALL,
};

export const HATCH_TRAILER: VehicleSpec = {
  ...HATCHBACK,
  max_forward: 6.5,
  max_reverse: 2.2,
  accel: 1.9,
  hitches: [BOX_TRAILER],
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
  steer_time: 1.5,
  creep_speed: 0.9,
  creep_accel: 0.8,
  max_forward: 3,
  max_reverse: 2.4,
  accel: 1.8,
  brake: 4,
  rolling: 0.3,
  park_speed: 0.3,
  hitches: [],
  forks: { length: 1.2, width: 0.86 },
  reverse_beeper: true,
};

const CITY_CAR: VehicleSpec = {
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

const SUV: VehicleSpec = {
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

const LIMO: VehicleSpec = {
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

const CAMPER: VehicleSpec = {
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
  hitches: [],
};

const GARBAGE_TRUCK: VehicleSpec = {
  ...TRUCK,
  length: 9.4,
  wheelbase: 4.5,
  rear_overhang: 2.8,
  turning_radius: 9,
  steer_time: 1.5,
};

const FIRE_ENGINE: VehicleSpec = {
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
const COACH: VehicleSpec = {
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

const DOUBLE_DECKER: VehicleSpec = {
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
  hitches: [],
};

const QUAD: VehicleSpec = {
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
  hitches: [],
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
  max_angle: BALL,
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
  max_angle: BALL,
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
  max_angle: BALL,
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
  max_angle: BALL,
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
  max_angle: BALL,
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
  max_angle: BALL,
};

const TOWING = { max_forward: 6, max_reverse: 2.1, accel: 1.8 };

const HORSE_BOX_RIG: VehicleSpec = { ...SUV, ...TOWING, hitches: [HORSE_BOX] };
const TRACTOR_RIG: VehicleSpec = { ...TRACTOR, accel: 1.4, hitches: [FARM_TRAILER] };
const QUAD_RIG: VehicleSpec = { ...QUAD, max_forward: 5, max_reverse: 1.8, accel: 2, hitches: [SMALL_TRAILER] };
const BOAT_RIG: VehicleSpec = { ...PICKUP, ...TOWING, hitches: [BOAT_TRAILER] };
const CARAVAN_RIG: VehicleSpec = { ...HATCHBACK, ...TOWING, max_forward: 5.5, accel: 1.6, hitches: [CARAVAN_TRAILER] };

const ARTICULATED_BUS: VehicleSpec = {
  ...BUS,
  length: 10.35,
  rear_overhang: 1.75,
  steer_time: 1.7,
  max_forward: 6.5,
  max_reverse: 2,
  accel: 1.2,
  hitches: [BUS_REAR],
};

const KINGPIN = degrees(80);
const DRAWBAR = degrees(60);
const TURNTABLE = degrees(45);
const CART = degrees(75);

/** A cab-over tractor unit: the cab sits over the front axle, so the front overhang is short and the lock tight. */
const CAB_OVER: VehicleSpec = {
  ...TRUCK,
  length: 6,
  wheelbase: 3.7,
  rear_overhang: 0.85,
  turning_radius: 6.9,
  steer_time: 1.5,
  max_forward: 5.5,
  max_reverse: 1.9,
  accel: 1,
};

// The kingpin sits just ahead of the tractor's drive axle, and the trailer's box reaches past it over the fifth wheel.
// Its tri-axle group turns about its middle, where the axle is.
const SEMI_TRAILER: TrailerSpec = {
  hitch: -0.35,
  axle: 7.7,
  drawbar: -1.6,
  box_length: 13.6,
  width: 2.55,
  track: 2.05,
  wheel_diameter: 0.9,
  wheel_width: 0.3,
  max_angle: KINGPIN,
};

const SEMI: VehicleSpec = { ...CAB_OVER, hitches: [SEMI_TRAILER] };

export const BOX_TRUCK: VehicleSpec = {
  ...TRUCK,
  length: 7.2,
  width: 2.45,
  track: 1.95,
  wheel_diameter: 0.85,
  wheel_width: 0.28,
  wheelbase: 3.9,
  rear_overhang: 1.9,
  turning_radius: 7.6,
  steer_time: 1.35,
  max_forward: 7,
  accel: 1.4,
};

const RIGID_TRUCK: VehicleSpec = {
  ...TRUCK,
  length: 9.4,
  width: 2.55,
  wheelbase: 5.4,
  rear_overhang: 2.6,
  turning_radius: 9.4,
  steer_time: 1.55,
  max_forward: 5.5,
  max_reverse: 1.9,
  accel: 1,
};

// A drawbar trailer is two hinges: the drawbar pivots on the truck's coupling and steers a dolly, and the body turns on
// a turntable over the dolly's axle.
const DOLLY: TrailerSpec = {
  hitch: 2.75,
  axle: 2.7,
  drawbar: 2.1,
  box_length: 1.2,
  width: 2.2,
  track: 2.0,
  wheel_diameter: 0.9,
  wheel_width: 0.3,
  max_angle: DRAWBAR,
};

const DRAWBAR_BODY: TrailerSpec = {
  hitch: 0,
  axle: 5,
  drawbar: -1.6,
  box_length: 7.6,
  width: 2.55,
  track: 2.05,
  wheel_diameter: 0.9,
  wheel_width: 0.3,
  max_angle: TURNTABLE,
};

const DRAWBAR_RIG: VehicleSpec = { ...RIGID_TRUCK, hitches: [DOLLY, DRAWBAR_BODY] };

// An A-double: a short semi-trailer, a converter dolly hooked behind it, and a second semi on the dolly's fifth wheel.
const LEAD_SEMI: TrailerSpec = { ...SEMI_TRAILER, axle: 6.3, drawbar: -1.4, box_length: 9.5 };
const CONVERTER_DOLLY: TrailerSpec = { ...DOLLY, hitch: 2.3, axle: 2.6, drawbar: 1.9, box_length: 1.4 };
const REAR_SEMI: TrailerSpec = { ...LEAD_SEMI, hitch: -0.1 };

const ROAD_TRAIN: VehicleSpec = {
  ...CAB_OVER,
  max_forward: 5,
  max_reverse: 1.6,
  accel: 0.8,
  hitches: [LEAD_SEMI, CONVERTER_DOLLY, REAR_SEMI],
};

const TUG: VehicleSpec = {
  drive: FRONT_STEER,
  length: 2.8,
  width: 1.4,
  wheelbase: 1.6,
  rear_overhang: 0.55,
  track: 1.15,
  wheel_diameter: 0.55,
  wheel_width: 0.2,
  turning_radius: 3.3,
  steer_time: 0.95,
  creep_speed: 1.4,
  creep_accel: 1,
  max_forward: 5,
  max_reverse: 1.8,
  accel: 1.8,
  brake: 6,
  rolling: 0.35,
  park_speed: 0.3,
  hitches: [],
};

const BAGGAGE_CART: TrailerSpec = {
  hitch: 1.7,
  axle: 2.4,
  drawbar: 0.9,
  box_length: 2.9,
  width: 1.45,
  track: 1.2,
  wheel_diameter: 0.42,
  wheel_width: 0.14,
  max_angle: CART,
};

const BAGGAGE_TRAIN: VehicleSpec = { ...TUG, hitches: [{ ...BAGGAGE_CART, hitch: 0.75 }, BAGGAGE_CART, BAGGAGE_CART] };

// An A320-sized airliner on a towbar off the tug's front: the hinge is the nose gear, 7.6 m ahead of the tug's rear axle
// (the tug's front stops just short of the nose), the main gear 12.6 m behind it, the nose 5.07 m ahead of it. The box
// is the fuselage; the wings are the Pushback game's. The hinge's limit is the nose gear's steering lock.
const AIRLINER: TrailerSpec = {
  hitch: -7.6,
  axle: 12.64,
  drawbar: -5.07,
  box_length: 37.57,
  width: 3.95,
  track: 7.59,
  wheel_diameter: 1.14,
  wheel_width: 0.4,
  max_angle: degrees(75),
  rest: Math.PI,
};

/** The tug pushing an airliner back: the Pushback game's rig, kept out of the garage. */
export const PUSHBACK: VehicleSpec = { ...TUG, steer_time: 2.2, max_forward: 2.2, max_reverse: 1.2, accel: 0.9, brake: 3, hitches: [AIRLINER] };

// The second trailer hitches to the first one's tail, 0.4 m behind its box.
const TRACTOR_TWO: VehicleSpec = {
  ...TRACTOR,
  max_forward: 4.5,
  accel: 1.2,
  hitches: [FARM_TRAILER, { ...FARM_TRAILER, hitch: 2.7 }],
};

// Three wheels: the model's front pair stands in for the one front wheel on the centre line, which steers the same
// bicycle; only the drawing shows one.
export const TUK_TUK: VehicleSpec = {
  drive: FRONT_STEER,
  length: 2.7,
  width: 1.3,
  wheelbase: 1.95,
  rear_overhang: 0.4,
  track: 1.15,
  wheel_diameter: 0.46,
  wheel_width: 0.13,
  turning_radius: 2.9,
  steer_time: 0.9,
  creep_speed: 1.5,
  creep_accel: 1.0,
  max_forward: 6,
  max_reverse: 2,
  accel: 1.8,
  brake: 5,
  rolling: 0.35,
  park_speed: 0.3,
  hitches: [],
};

export const GOLF_CART: VehicleSpec = {
  drive: FRONT_STEER,
  length: 2.4,
  width: 1.2,
  wheelbase: 1.65,
  rear_overhang: 0.4,
  track: 0.9,
  wheel_diameter: 0.46,
  wheel_width: 0.18,
  turning_radius: 3.1,
  steer_time: 0.9,
  creep_speed: 1,
  creep_accel: 0,
  max_forward: 5.5,
  max_reverse: 2.5,
  accel: 1.6,
  brake: 5,
  rolling: 0.4,
  park_speed: 0.3,
  hitches: [],
};

export const ICE_RESURFACER: VehicleSpec = {
  drive: FRONT_STEER,
  length: 4.3,
  width: 2.1,
  wheelbase: 2.4,
  rear_overhang: 1.25,
  track: 1.7,
  wheel_diameter: 0.66,
  wheel_width: 0.22,
  turning_radius: 4.6,
  steer_time: 1.4,
  creep_speed: 1,
  creep_accel: 0.6,
  max_forward: 3.5,
  max_reverse: 1.5,
  accel: 1,
  brake: 4,
  rolling: 0.25,
  park_speed: 0.3,
  hitches: [],
};

// A joke: every caster of a real one swivels; front steer on a huge lock pivots it nearly on the spot the way pushing
// one does. Walking pace, and no creep: it stops when you stop pushing.
export const SHOPPING_TROLLEY: VehicleSpec = {
  drive: FRONT_STEER,
  length: 0.95,
  width: 0.56,
  wheelbase: 0.7,
  rear_overhang: 0.12,
  track: 0.45,
  wheel_diameter: 0.12,
  wheel_width: 0.04,
  turning_radius: 0.78,
  steer_time: 0.45,
  creep_speed: 1,
  creep_accel: 0,
  max_forward: 1.6,
  max_reverse: 1.2,
  accel: 1.4,
  brake: 4,
  rolling: 0.5,
  park_speed: 0.3,
  hitches: [],
  unlit: true,
};

// A racing car's lock is tiny, so its turning circle is a lorry's: that is the challenge. The width is over the open
// wheels. Its pace is capped at what a kinematic model with no tyre slip still drives believably.
export const F1_CAR: VehicleSpec = {
  drive: FRONT_STEER,
  length: 5.6,
  width: 2.0,
  wheelbase: 3.6,
  rear_overhang: 0.95,
  track: 1.6,
  wheel_diameter: 0.72,
  wheel_width: 0.38,
  turning_radius: 9.5,
  steer_time: 0.8,
  creep_speed: 1,
  creep_accel: 0,
  max_forward: 14,
  max_reverse: 2,
  accel: 6,
  brake: 12,
  rolling: 0.3,
  park_speed: 0.3,
  hitches: [],
  unlit: true,
  a_lat: 12,
};

// Staggered tyres: `wheel_width` is the rears', the drawing narrows the fronts.
export const GT_CAR: VehicleSpec = {
  drive: FRONT_STEER,
  length: 4.5,
  width: 1.95,
  wheelbase: 2.65,
  rear_overhang: 0.95,
  track: 1.65,
  wheel_diameter: 0.68,
  wheel_width: 0.3,
  turning_radius: 5.8,
  steer_time: 0.6,
  creep_speed: 1.8,
  creep_accel: 1.2,
  max_forward: 38,
  max_reverse: 3,
  accel: 8.5,
  brake: 18,
  rolling: 0.3,
  park_speed: 0.3,
  hitches: [],
  a_lat: 16,
};

// Single track: the model's two wheels per axle both sit on the centre line, so it steers the same bicycle and the
// drawing shows one wheel at each end. Backing up is the rider paddling it with their feet.
export const MOTORCYCLE: VehicleSpec = {
  drive: FRONT_STEER,
  length: 2.1,
  width: 0.8,
  wheelbase: 1.45,
  rear_overhang: 0.33,
  track: 0,
  wheel_diameter: 0.62,
  wheel_width: 0.15,
  turning_radius: 2.6,
  steer_time: 0.6,
  creep_speed: 1,
  creep_accel: 1.0,
  max_forward: 34,
  max_reverse: 1,
  accel: 7,
  brake: 9,
  rolling: 0.3,
  park_speed: 0.3,
  hitches: [],
  a_lat: 9.5,
};

// Skid steers: the pose is the middle of the wheels' or tracks' contact, and `turning_radius` is the circle the outer
// wheel draws pivoting on the spot (lots size their room by it).
export const BOBCAT: VehicleSpec = {
  drive: { kind: DriveKind.SKID, track: 1.6 },
  length: 3.2,
  width: 1.7,
  wheelbase: 1.05,
  rear_overhang: 0.6,
  track: 1.32,
  wheel_diameter: 0.7,
  wheel_width: 0.3,
  turning_radius: 1.2,
  steer_time: 0.6,
  creep_speed: 0.8,
  creep_accel: 0.6,
  max_forward: 3.2,
  max_reverse: 2.5,
  accel: 2.2,
  brake: 6,
  rolling: 0.5,
  park_speed: 0.3,
  hitches: [],
  reverse_beeper: true,
};

// A zero-turn mower pivots about its two driven rear wheels; the front casters only follow, so the contact is that one axle.
export const MOWER: VehicleSpec = {
  drive: { kind: DriveKind.SKID, track: 1.2 },
  length: 2.1,
  width: 1.55,
  wheelbase: 0,
  rear_overhang: 0.45,
  track: 1.15,
  wheel_diameter: 0.6,
  wheel_width: 0.28,
  turning_radius: 0.75,
  steer_time: 0.95,
  creep_speed: 1,
  creep_accel: 0,
  max_forward: 3.5,
  max_reverse: 1.6,
  accel: 2,
  brake: 5,
  rolling: 0.5,
  park_speed: 0.3,
  hitches: [],
  unlit: true,
};

// The hull plus the gun's metre past it; `track` and `wheel_width` are the tracks' centres and width, `wheelbase` their contact.
export const TANK: VehicleSpec = {
  drive: { kind: DriveKind.SKID, track: 2.9 },
  length: 6.6,
  width: 3.0,
  wheelbase: 4.2,
  rear_overhang: 0.5,
  track: 2.4,
  wheel_diameter: 0.8,
  wheel_width: 0.55,
  turning_radius: 2.6,
  steer_time: 0.9,
  creep_speed: 1,
  creep_accel: 0.5,
  max_forward: 4,
  max_reverse: 2.5,
  accel: 1.2,
  brake: 5,
  rolling: 0.6,
  park_speed: 0.3,
  hitches: [],
};

// Frame steers: the pose is the rear axle and the joint sits `pivot` behind the front one.
export const WHEEL_LOADER: VehicleSpec = {
  drive: { kind: DriveKind.FRAME, pivot: 1.4 },
  length: 7,
  width: 2.5,
  wheelbase: 2.8,
  rear_overhang: 1.6,
  track: 1.9,
  wheel_diameter: 1.3,
  wheel_width: 0.5,
  turning_radius: 4.8,
  steer_time: 1.3,
  creep_speed: 1.2,
  creep_accel: 0.7,
  max_forward: 5,
  max_reverse: 3,
  accel: 1.4,
  brake: 5,
  rolling: 0.4,
  park_speed: 0.3,
  hitches: [],
  reverse_beeper: true,
};

// The joint sits close behind the cab's axle; `wheelbase` runs to the middle of the rear bogie, whose two axles turn about it.
export const DUMP_TRUCK: VehicleSpec = {
  drive: { kind: DriveKind.FRAME, pivot: 1.6 },
  length: 10.5,
  width: 2.8,
  wheelbase: 6,
  rear_overhang: 1.9,
  track: 2.3,
  wheel_diameter: 1.5,
  wheel_width: 0.6,
  turning_radius: 8.6,
  steer_time: 1.6,
  creep_speed: 1.2,
  creep_accel: 0.7,
  max_forward: 6,
  max_reverse: 2.5,
  accel: 1.2,
  brake: 4.5,
  rolling: 0.35,
  park_speed: 0.3,
  hitches: [],
  reverse_beeper: true,
};

// A tiller truck's rear driver steers the back so it tracks inside the front; all-wheel steer stands in for that.
export const LADDER_TRUCK: VehicleSpec = {
  drive: ALL_STEER,
  length: 12.5,
  width: 2.5,
  wheelbase: 6.8,
  rear_overhang: 2.4,
  track: 2.05,
  wheel_diameter: 1,
  wheel_width: 0.32,
  turning_radius: 8.5,
  steer_time: 1.6,
  creep_speed: 1.4,
  creep_accel: 0.8,
  max_forward: 7,
  max_reverse: 2.2,
  accel: 1.3,
  brake: 5,
  rolling: 0.3,
  park_speed: 0.25,
  hitches: [],
};

// Two-wheel, four-wheel and crab steer on a real one; here four-wheel and crab. The boom and the forks are in `length`.
export const TELEHANDLER: VehicleSpec = {
  drive: CRAB_STEER,
  length: 5.6,
  width: 2.35,
  wheelbase: 2.9,
  rear_overhang: 0.9,
  track: 1.9,
  wheel_diameter: 1,
  wheel_width: 0.4,
  turning_radius: 3.9,
  steer_time: 1.1,
  creep_speed: 1,
  creep_accel: 0.6,
  max_forward: 5,
  max_reverse: 3,
  accel: 1.5,
  brake: 5,
  rolling: 0.35,
  park_speed: 0.3,
  hitches: [],
  reverse_beeper: true,
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
  TUK_TUK: "tuk-tuk",
  GOLF_CART: "golf-cart",
  RESURFACER: "resurfacer",
  TROLLEY: "trolley",
  F1: "f1",
  GT: "gt",
  MOTORCYCLE: "motorcycle",
  SEMI: "semi",
  BOX_TRUCK: "box-truck",
  DRAWBAR: "drawbar",
  ROAD_TRAIN: "road-train",
  BAGGAGE: "baggage",
  TRACTOR_TWO: "tractor-two",
  BOBCAT: "bobcat",
  MOWER: "mower",
  TANK: "tank",
  LOADER: "loader",
  DUMPER: "dumper",
  LADDER: "ladder",
  TELEHANDLER: "telehandler",
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
  "tuk-tuk": TUK_TUK,
  "golf-cart": GOLF_CART,
  resurfacer: ICE_RESURFACER,
  trolley: SHOPPING_TROLLEY,
  f1: F1_CAR,
  gt: GT_CAR,
  motorcycle: MOTORCYCLE,
  semi: SEMI,
  "box-truck": BOX_TRUCK,
  drawbar: DRAWBAR_RIG,
  "road-train": ROAD_TRAIN,
  baggage: BAGGAGE_TRAIN,
  "tractor-two": TRACTOR_TWO,
  bobcat: BOBCAT,
  mower: MOWER,
  tank: TANK,
  loader: WHEEL_LOADER,
  dumper: DUMP_TRUCK,
  ladder: LADDER_TRUCK,
  telehandler: TELEHANDLER,
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
  "tuk-tuk": "Tuk-tuk",
  "golf-cart": "Golf cart",
  resurfacer: "Ice resurfacer",
  trolley: "Shopping trolley",
  f1: "F1 car",
  gt: "GT car",
  motorcycle: "Motorcycle",
  semi: "Truck and semi-trailer",
  "box-truck": "Box truck",
  drawbar: "Truck and drawbar trailer",
  "road-train": "Road train",
  baggage: "Baggage train",
  "tractor-two": "Tractor and two trailers",
  bobcat: "Skid-steer loader",
  mower: "Zero-turn mower",
  tank: "Tank",
  loader: "Wheel loader",
  dumper: "Articulated dump truck",
  ladder: "Ladder truck",
  telehandler: "Telehandler",
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
  trailers?: Trailer[];
  /** Only on a vehicle with a crab mode, while it is on. */
  crab?: boolean;
}

export interface Trailer {
  /** From its axle toward its hinge. */
  heading: number;
  roll: [number, number];
}

/** `steer` matters only to a frame steer, whose joint's bend is part of its shape; missing, the joint is straight. */
export type Placement = Pick<Car, "x" | "y" | "heading" | "trailers"> & Partial<Pick<Car, "steer">>;

export type Rolls = [number, number, number, number];

export interface Input {
  /** Wanted wheel position from -1 (full left) to 1 (full right); null lets go, so the wheel self-centres as the car rolls. */
  steer: number | null;
  throttle: number;
  brake: number;
  /** The turn signal; `step` ignores it, a game that judges signals reads it. */
  signal?: Signal;
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

const frame_locks = new WeakMap<VehicleSpec, number>();

/** For a skid steer the wheel's share itself (1 at full lock), for a frame steer the joint's bend, else the wheel angle. */
export function max_steer(spec: VehicleSpec): number {
  const drive = spec.drive;
  if (drive.kind === DriveKind.SKID) return 1;
  if (drive.kind === DriveKind.FRAME) {
    let found = frame_locks.get(spec);
    if (found === undefined) {
      found = frame_lock(spec, drive);
      frame_locks.set(spec, found);
    }
    return found;
  }
  const base = steer_base(spec);
  const outer = Math.sqrt(spec.turning_radius ** 2 - base ** 2);
  return Math.atan(base / (outer - spec.track / 2));
}

// The bend at which the outer wheel of whichever axle swings widest draws `turning_radius`: each axle's centre turns
// on (its own arm · cos γ + the other's) / sin γ about the turn centre.
function frame_lock(spec: VehicleSpec, drive: FrameDrive): number {
  const front = drive.pivot;
  const rear = spec.wheelbase - drive.pivot;
  const radius = (gamma: number) =>
    Math.max(rear * Math.cos(gamma) + front, front * Math.cos(gamma) + rear) / Math.sin(gamma) + spec.track / 2;
  let lo = 1e-3;
  let hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (radius(mid) > spec.turning_radius) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function four_wheel(spec: VehicleSpec): boolean {
  const drive = spec.drive;
  return drive.kind === DriveKind.ACKERMANN && (drive.steer_axle === SteerAxle.ALL || drive.steer_axle === SteerAxle.CRAB);
}

export function can_crab(spec: VehicleSpec): boolean {
  return spec.drive.kind === DriveKind.ACKERMANN && spec.drive.steer_axle === SteerAxle.CRAB;
}

function crabbing(car: Pick<Car, "crab">, spec: VehicleSpec): boolean {
  return !!car.crab && can_crab(spec);
}

/** Pose to the steered axle: the wheelbase, or half of it when both axles steer and the pose sits between them. */
export function steer_base(spec: VehicleSpec): number {
  return four_wheel(spec) ? spec.wheelbase / 2 : spec.wheelbase;
}

/** Crab mode switches only near a standstill, like P. */
export function set_crab(car: Car, on: boolean, spec: VehicleSpec): Car {
  if (!can_crab(spec) || !!car.crab === on || Math.abs(car.speed) > spec.park_speed) return car;
  return { ...car, crab: on };
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
  if (spec.hitches.length === 0) return car;
  return { ...car, trailers: rest_trailers(pose.heading, spec) };
}

/** Each link's heading turned from the vehicle's by the rest angles down the chain to it. */
export function chain_rests(spec: VehicleSpec): number[] {
  let total = 0;
  return spec.hitches.map((link) => (total += link.rest ?? 0));
}

/** The chain at rest behind a vehicle heading `heading`. */
export function rest_trailers(heading: number, spec: VehicleSpec): Trailer[] {
  return chain_rests(spec).map((rest) => ({ heading: heading - rest, roll: [0, 0] }));
}

/** The last link hangs ahead of the vehicle, so it leads going forward and the vehicle's own tail leads in reverse. */
export function hangs_ahead(spec: VehicleSpec): boolean {
  return Math.cos(chain_rests(spec).at(-1) ?? 0) < 0;
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

/**
 * The most wheel (or bend) the tyres take at this speed. A kinematic car has no slip to slide on, so the turn's
 * curvature stays within a_lat / v² for a spec that sets `a_lat` (the fast ones); every other vehicle keeps its full
 * lock. A skid steer and crab mode draw no such curve and keep it too.
 */
export function grip_lock(speed: number, spec: VehicleSpec, crab = false): number {
  const limit = max_steer(spec);
  const drive = spec.drive;
  const v2 = speed * speed;
  if (spec.a_lat === undefined || drive.kind === DriveKind.SKID || crab || v2 < 1e-6) return limit;
  const k = spec.a_lat / v2;
  if (drive.kind === DriveKind.FRAME) {
    // The axle on the shorter arm turns tightest, on (long · cos γ + short) / sin γ.
    const short = Math.min(drive.pivot, spec.wheelbase - drive.pivot);
    const long = spec.wheelbase - short;
    const bend = Math.atan(k * long) + Math.asin(Math.min(1, (k * short) / Math.hypot(1, k * long)));
    return Math.min(limit, bend);
  }
  return Math.min(limit, Math.atan(steer_base(spec) * k));
}

/** The steady speed the throttle holds against rolling resistance. */
export function top_speed(spec: VehicleSpec): number {
  return spec.max_forward * (1 - spec.rolling / spec.accel);
}

function steer_target(car: Car, input: Input, limit: number, grip: number): number {
  if (input.steer !== null) return clamp(clamp(input.steer, -1, 1) * limit, -grip, grip);
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
 * One fixed step, dispatched on the drive. Ackermann is the kinematic bicycle model: no tyre slip, so the unsteered
 * axle (or the middle, when both steer) only moves along the heading and the vehicle turns about a point on that line.
 * A positive wheel turns right on every drive: steered at the rear, the rear wheels point left and the tail swings
 * out. The arc is integrated exactly for the step; a trailer follows it about the tow ball.
 */
export function step(car: Car, input: Input, dt: number, spec: VehicleSpec = HATCHBACK): Car {
  if (!(dt > 0)) return car;
  const limit = max_steer(spec);
  const grip = grip_lock(car.speed, spec, crabbing(car, spec));
  const steer = approach(car.steer, steer_target(car, input, limit, grip), steer_rate(car, input, limit, spec), dt);
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

  const drive = spec.drive;
  let other: Moved | null = null;
  if (drive.kind === DriveKind.SKID) other = skid_move(car, car.roll, steer, distance, drive.track);
  else if (drive.kind === DriveKind.FRAME) other = frame_move(car, car.roll, car.steer, steer, car.speed * dt, speed * dt, spec, drive);
  else if (crabbing(car, spec)) other = crab_move(car, car.roll, steer, distance);
  if (other) return { ...next, ...other.pose, speed, roll: other.roll };

  const curvature = Math.tan(steer) / steer_base(spec);
  const moved: Car = {
    ...next,
    ...arc(car, curvature, distance),
    speed,
    roll: roll(car.roll, curvature, distance, spec),
  };
  if (spec.hitches.length === 0 || !car.trailers) return moved;
  return { ...moved, trailers: tow(car, car.trailers, curvature, distance, spec.hitches) };
}

interface Moved {
  pose: Pose;
  roll: Rolls;
}

const NO_ROLL: Rolls = [0, 0, 0, 0];

/**
 * Differential steering: `distance` is what the outer track covers and `share` (the wheel, −1 to 1) slows the inner
 * one, down to running it backwards at full lock. The body moves `distance · (1 − |share|)` ahead and turns
 * `2 · distance · share / track`, so at half lock it turns about the inner track and at full lock on the spot.
 */
function skid_move(from: Pose, rolls: Rolls, share: number, distance: number, track: number): Moved {
  const forward = distance * (1 - Math.abs(share));
  const turn = (2 * distance * share) / track;
  const heading = from.heading + turn;
  const pose =
    Math.abs(turn) < 1e-9
      ? arc(from, 0, forward)
      : {
          x: from.x + (forward / turn) * (Math.sin(heading) - Math.sin(from.heading)),
          y: from.y + (forward / turn) * (Math.cos(from.heading) - Math.cos(heading)),
          heading,
        };
  const left = forward + (turn * track) / 2;
  const right = forward - (turn * track) / 2;
  return { pose, roll: [rolls[0] + left, rolls[1] + right, rolls[2] + left, rolls[3] + right] };
}

function crab_move(from: Pose, rolls: Rolls, steer: number, distance: number): Moved {
  const way = from.heading + steer;
  return {
    pose: { x: from.x + Math.cos(way) * distance, y: from.y + Math.sin(way) * distance, heading: from.heading },
    roll: [rolls[0] + distance, rolls[1] + distance, rolls[2] + distance, rolls[3] + distance],
  };
}

const FRAME_STEP = 0.05;
const FRAME_BEND_STEP = 0.02;

/**
 * A centre-articulated vehicle: the pose is the rear axle, `steer` the joint's bend γ, the front axle `a` ahead of the
 * joint and the rear axle `b` behind it. Neither axle slides sideways, so the rear frame turns at
 * dθ = (v·sin γ − a·dγ) / (b·cos γ + a) and the front axle covers v·cos γ + b·dθ·sin γ: bending at a standstill swings
 * both frames about their axles. Over one call the bend and the rear axle's run (`run0` to `run1`, metres per call)
 * change linearly; RK4 in pieces of at most 5 cm or 1.1°.
 */
function frame_move(
  from: Pose,
  rolls: Rolls,
  from_bend: number,
  to_bend: number,
  run0: number,
  run1: number,
  spec: VehicleSpec,
  drive: FrameDrive
): Moved {
  const ahead = drive.pivot;
  const behind = spec.wheelbase - drive.pivot;
  const bend = to_bend - from_bend;
  const pieces = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(run0), Math.abs(run1)) / FRAME_STEP),
    Math.ceil(Math.abs(bend) / FRAME_BEND_STEP)
  );
  // State: rear heading, x, y, the rear axle's run, the front axle's run.
  const slope = (u: number, heading: number, out: number[]) => {
    const gamma = from_bend + bend * u;
    const run = run0 + (run1 - run0) * u;
    const turn = (run * Math.sin(gamma) - ahead * bend) / (behind * Math.cos(gamma) + ahead);
    out[0] = turn;
    out[1] = run * Math.cos(heading);
    out[2] = run * Math.sin(heading);
    out[3] = run;
    out[4] = run * Math.cos(gamma) + behind * turn * Math.sin(gamma);
  };
  const state = [from.heading, from.x, from.y, 0, 0];
  const k1 = [0, 0, 0, 0, 0];
  const k2 = [0, 0, 0, 0, 0];
  const k3 = [0, 0, 0, 0, 0];
  const k4 = [0, 0, 0, 0, 0];
  const du = 1 / pieces;
  for (let p = 0; p < pieces; p++) {
    const u = p * du;
    slope(u, state[0], k1);
    slope(u + du / 2, state[0] + (du / 2) * k1[0], k2);
    slope(u + du / 2, state[0] + (du / 2) * k2[0], k3);
    slope(u + du, state[0] + du * k3[0], k4);
    for (let i = 0; i < 5; i++) state[i] += (du / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  const half = spec.track / 2;
  const rear_turn = state[0] - from.heading;
  const front_turn = rear_turn + bend;
  return {
    pose: { x: state[1], y: state[2], heading: state[0] },
    roll: [
      rolls[0] + state[4] + half * front_turn,
      rolls[1] + state[4] - half * front_turn,
      rolls[2] + state[3] + half * rear_turn,
      rolls[3] + state[3] - half * rear_turn,
    ],
  };
}

/** Radians per metre a frame steer's joint bends in `travel`: a driver bends it while rolling, lock to lock in about 3 m. */
export const FRAME_RAMP = 0.5;

/**
 * Where `distance` of driving with the wheel at `steer` takes a placement, without the pedals' dynamics: the planner's
 * moves and the guide lines. A frame steer's joint bends toward `steer` at `FRAME_RAMP` as it rolls; `crab` drives a
 * vehicle that has a crab mode in it.
 */
export function travel(from: Placement, steer: number, distance: number, spec: VehicleSpec, crab = false): Placement {
  const drive = spec.drive;
  if (drive.kind === DriveKind.SKID) return skid_move(from, NO_ROLL, steer, distance, drive.track).pose;
  if (drive.kind === DriveKind.FRAME) {
    const was = from.steer ?? 0;
    const bend = approach(was, steer, FRAME_RAMP, Math.abs(distance));
    return { ...frame_move(from, NO_ROLL, was, bend, distance, distance, spec, drive).pose, steer: bend };
  }
  if (crab && can_crab(spec)) return crab_move(from, NO_ROLL, steer, distance).pose;
  const curvature = Math.tan(steer) / steer_base(spec);
  const pose = arc(from, curvature, distance);
  if (spec.hitches.length === 0 || !from.trailers) return pose;
  return { ...pose, trailers: tow(from, from.trailers, curvature, distance, spec.hitches) };
}

const TOW_STEP = 0.025;

/**
 * The hitch chain behind a vehicle that drives `distance` along an arc of `curvature` from `pose`. Each link follows the
 * body ahead of it about its hinge. With ψ = φₚ − φ the hinge angle, h the hinge behind the body ahead's axle, L the
 * hinge to the link's axle, and v and ω that axle's speed and turn per metre the vehicle covers (1 and κ for the
 * vehicle itself): dφ/ds = (v·sin ψ − h·ω·cos ψ) / L, and the link's axle covers v·cos ψ + h·ω·sin ψ. The vehicle's
 * heading along the arc is exact, so RK4 over the whole chain in steps of at most 2.5 cm stays far inside the
 * tolerances that matter, even reversing, which amplifies every error.
 */
export function tow(
  pose: Pose,
  trailers: readonly Trailer[],
  curvature: number,
  distance: number,
  hitches: readonly TrailerSpec[]
): Trailer[] {
  if (distance === 0) return trailers as Trailer[];
  const n = trailers.length;
  const slope = (s: number, phi: Float64Array, turn: Float64Array, speed: Float64Array) => {
    const first = hitches[0];
    const psi = pose.heading + curvature * s - phi[0];
    const sin = Math.sin(psi);
    const cos = Math.cos(psi);
    turn[0] = (sin - first.hitch * curvature * cos) / first.axle;
    speed[0] = cos + first.hitch * curvature * sin;
    for (let i = 1; i < n; i++) {
      const link = hitches[i];
      const v = speed[i - 1];
      const w = turn[i - 1];
      const bend = phi[i - 1] - phi[i];
      const b_sin = Math.sin(bend);
      const b_cos = Math.cos(bend);
      turn[i] = (v * b_sin - link.hitch * w * b_cos) / link.axle;
      speed[i] = v * b_cos + link.hitch * w * b_sin;
    }
  };
  const make = () => Array.from({ length: 2 }, () => new Float64Array(n));
  const [k1, a1] = make();
  const [k2, a2] = make();
  const [k3, a3] = make();
  const [k4, a4] = make();
  const probe = new Float64Array(n);
  const phi = Float64Array.from(trailers, (each) => each.heading);
  const along = new Float64Array(n);
  const pieces = Math.max(1, Math.ceil(Math.abs(distance) / TOW_STEP));
  const ds = distance / pieces;
  for (let p = 0; p < pieces; p++) {
    const s = p * ds;
    slope(s, phi, k1, a1);
    for (let i = 0; i < n; i++) probe[i] = phi[i] + (ds / 2) * k1[i];
    slope(s + ds / 2, probe, k2, a2);
    for (let i = 0; i < n; i++) probe[i] = phi[i] + (ds / 2) * k2[i];
    slope(s + ds / 2, probe, k3, a3);
    for (let i = 0; i < n; i++) probe[i] = phi[i] + ds * k3[i];
    slope(s + ds, probe, k4, a4);
    for (let i = 0; i < n; i++) {
      phi[i] += (ds / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      along[i] += (ds / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
    }
  }
  // The left wheel (−y) sits outside a right turn: it covers the axle's distance plus half a track times the turn.
  return trailers.map((trailer, i) => {
    const turned = phi[i] - trailer.heading;
    const half = hitches[i].track / 2;
    return {
      heading: phi[i],
      roll: [trailer.roll[0] + along[i] + half * turned, trailer.roll[1] + along[i] - half * turned],
    };
  });
}

export function hitch_angles(car: Placement): number[] {
  if (!car.trailers) return [];
  return car.trailers.map((trailer, i) => wrap_angle((i === 0 ? car.heading : car.trailers![i - 1].heading) - trailer.heading));
}

/** Each hinge's angle away from its link's rest angle. */
export function folds(car: Placement, spec: VehicleSpec): number[] {
  return hitch_angles(car).map((angle, i) => {
    const rest = spec.hitches[i]?.rest;
    return rest ? wrap_angle(angle - rest) : angle;
  });
}

/** The first hinge folded past its link's limit, or −1. */
export function jackknife(car: Placement, spec: VehicleSpec): number {
  const angles = folds(car, spec);
  return spec.hitches.findIndex((link, i) => Math.abs(angles[i] ?? 0) > link.max_angle);
}

export function jackknifed(car: Placement, spec: VehicleSpec): boolean {
  return jackknife(car, spec) >= 0;
}

/** Each link's axle as a pose, first link first; a placement without trailers has them at rest. */
export function trailer_poses(car: Placement, spec: VehicleSpec): Pose[] {
  const poses: Pose[] = [];
  let ahead: Pose = car;
  spec.hitches.forEach((link, i) => {
    const ball = to_world(ahead, { x: -link.hitch, y: 0 });
    const heading = car.trailers?.[i]?.heading ?? ahead.heading - (link.rest ?? 0);
    ahead = { x: ball.x - Math.cos(heading) * link.axle, y: ball.y - Math.sin(heading) * link.axle, heading };
    poses.push(ahead);
  });
  return poses;
}

export function trailer_pose(car: Placement, spec: VehicleSpec, index = 0): Pose {
  return trailer_poses(car, spec)[index];
}

export function hitch_point(car: Placement, spec: VehicleSpec, index = 0): Vec {
  const ahead = index === 0 ? car : trailer_pose(car, spec, index - 1);
  return to_world(ahead, { x: -spec.hitches[index].hitch, y: 0 });
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

export function trailer_corners(car: Placement, spec: VehicleSpec, index = 0): Vec[] {
  const pose = trailer_pose(car, spec, index);
  return trailer_local(spec.hitches[index]).map((point) => to_world(pose, point));
}

export function trailer_wheels(car: Placement, spec: VehicleSpec, index = 0): Vec[] {
  const pose = trailer_pose(car, spec, index);
  const half = spec.hitches[index].track / 2;
  return [to_world(pose, { x: 0, y: -half }), to_world(pose, { x: 0, y: half })];
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

const JOINT_GAP = 0.12;

function box(front: number, rear: number, half: number): Vec[] {
  return [
    { x: front, y: -half },
    { x: front, y: half },
    { x: rear, y: half },
    { x: rear, y: -half },
  ];
}

/** A frame steer's front frame as a pose: its axle, turned by the joint's bend. Any other vehicle's own pose. */
export function front_frame(car: Placement, spec: VehicleSpec): Pose {
  const drive = spec.drive;
  if (drive.kind !== DriveKind.FRAME) return { x: car.x, y: car.y, heading: car.heading };
  const joint = to_world(car, { x: spec.wheelbase - drive.pivot, y: 0 });
  const heading = car.heading + (car.steer ?? 0);
  return { x: joint.x + Math.cos(heading) * drive.pivot, y: joint.y + Math.sin(heading) * drive.pivot, heading };
}

export interface Ends {
  front: number;
  rear: number;
}

/** A frame steer's two frames along their own axes: the front one's from the front axle, the rear one's from the rear axle. */
export function frame_ends(spec: VehicleSpec): { front: Ends; rear: Ends } {
  const pivot = spec.drive.kind === DriveKind.FRAME ? spec.drive.pivot : spec.wheelbase / 2;
  return {
    front: { front: spec.length - spec.rear_overhang - spec.wheelbase, rear: -pivot + JOINT_GAP },
    rear: { front: spec.wheelbase - pivot - JOINT_GAP, rear: -spec.rear_overhang },
  };
}

function frame_bodies(car: Placement, spec: VehicleSpec): Vec[][] {
  const ends = frame_ends(spec);
  const half = spec.width / 2;
  const ahead = front_frame(car, spec);
  return [
    box(ends.front.front, ends.front.rear, half).map((point) => to_world(ahead, point)),
    box(ends.rear.front, ends.rear.rear, half).map((point) => to_world(car, point)),
  ];
}

/** The leading and trailing corners in `body_local` order; a frame steer's front ones are on its front frame. */
export function outline(car: Placement, spec: VehicleSpec): Vec[] {
  if (spec.drive.kind !== DriveKind.FRAME) return corners(car, spec);
  const [front, rear] = frame_bodies(car, spec);
  return [front[0], front[1], rear[2], rear[3]];
}

/** Every heading a parked vehicle must line up: the body's, a frame steer's front frame, each trailer's turned back by its rest. */
export function headings(car: Placement, spec: VehicleSpec): number[] {
  const own = spec.drive.kind === DriveKind.FRAME ? [car.heading, car.heading + (car.steer ?? 0)] : [car.heading];
  const rests = chain_rests(spec);
  return [...own, ...(car.trailers ?? []).map((trailer, i) => trailer.heading + (rests[i] ?? 0))];
}

/** The middle of the very front, fork tips included. */
export function nose(car: Placement, spec: VehicleSpec): Vec {
  if (spec.drive.kind === DriveKind.FRAME) return to_world(front_frame(car, spec), { x: frame_ends(spec).front.front, y: 0 });
  return to_world(car, { x: rig_ends(spec).front, y: 0 });
}

/** The body first (a frame steer's front frame, then its rear one), then the forks, then each trailer's box down the chain. */
export function bodies(car: Placement, spec: VehicleSpec = HATCHBACK): Vec[][] {
  const found = spec.drive.kind === DriveKind.FRAME ? frame_bodies(car, spec) : [corners(car, spec)];
  const forks = fork_corners(car, spec);
  if (forks) found.push(forks);
  if (spec.hitches.length > 0) {
    trailer_poses(car, spec).forEach((pose, i) => found.push(trailer_local(spec.hitches[i]).map((point) => to_world(pose, point))));
  }
  return found;
}

/** From the pose, straight: a frame steer's pose is its rear axle; all-wheel, crab and skid steers' the middle. */
export function axles(spec: VehicleSpec): Ends {
  const drive = spec.drive;
  if (drive.kind === DriveKind.ACKERMANN && drive.steer_axle === SteerAxle.REAR) return { front: 0, rear: -spec.wheelbase };
  if (drive.kind === DriveKind.FRAME || (drive.kind === DriveKind.ACKERMANN && drive.steer_axle === SteerAxle.FRONT)) return { front: spec.wheelbase, rear: 0 };
  return { front: spec.wheelbase / 2, rear: -spec.wheelbase / 2 };
}

export function body_ends(spec: VehicleSpec): { front: number; rear: number } {
  const rear = axles(spec).rear - spec.rear_overhang;
  return { front: rear + spec.length, rear };
}

/** The whole rig's ends from the pose, at rest: fork tips at the front, the furthest trailer's tail at the back. */
export function rig_ends(spec: VehicleSpec): { front: number; rear: number } {
  const { front, rear } = body_ends(spec);
  if (spec.hitches.length === 0) return { front: front + (spec.forks?.length ?? 0), rear };
  if (spec.hitches.some((link) => link.rest)) {
    const xs = bodies({ x: 0, y: 0, heading: 0 }, spec).flatMap((body) => body.map((point) => point.x));
    return { front: Math.max(...xs), rear: Math.min(...xs) };
  }
  let ball = 0;
  let tail = Infinity;
  spec.hitches.forEach((link, i) => {
    ball -= link.hitch;
    tail = Math.min(tail, -(-ball + link.drawbar + link.box_length));
    if (i < spec.hitches.length - 1) ball -= link.axle;
  });
  return { front: front + (spec.forks?.length ?? 0), rear: tail };
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

/** Angles are from the pose's heading; a frame steer's front pair turns with its front frame. */
export function wheels(car: Car, spec: VehicleSpec = HATCHBACK): Wheel[] {
  const half = spec.track / 2;
  const drive = spec.drive;
  const { front, rear } = axles(spec);
  if (drive.kind === DriveKind.FRAME) {
    const ahead = front_frame(car, spec);
    return [
      { at: to_world(ahead, { x: 0, y: -half }), angle: car.steer },
      { at: to_world(ahead, { x: 0, y: half }), angle: car.steer },
      { at: to_world(car, { x: rear, y: -half }), angle: 0 },
      { at: to_world(car, { x: rear, y: half }), angle: 0 },
    ];
  }
  if (drive.kind === DriveKind.SKID || crabbing(car, spec)) {
    const angle = drive.kind === DriveKind.SKID ? 0 : car.steer;
    return [
      { at: to_world(car, { x: front, y: -half }), angle },
      { at: to_world(car, { x: front, y: half }), angle },
      { at: to_world(car, { x: rear, y: -half }), angle },
      { at: to_world(car, { x: rear, y: half }), angle },
    ];
  }
  const curvature = Math.tan(car.steer) / steer_base(spec);
  const both = four_wheel(spec);
  const rear_steer = drive.steer_axle === SteerAxle.REAR;
  // atan2, not atan: a forklift's turn centre lies inside its track, so its inner wheel turns past 90°.
  const angle = (x: number, side: number, steered: boolean) =>
    !steered || Math.abs(curvature) < 1e-9 ? 0 : Math.atan2(x * curvature, 1 - side * curvature);
  return [
    { at: to_world(car, { x: front, y: -half }), angle: angle(front, -half, both || !rear_steer) },
    { at: to_world(car, { x: front, y: half }), angle: angle(front, half, both || !rear_steer) },
    { at: to_world(car, { x: rear, y: -half }), angle: angle(rear, -half, both || rear_steer) },
    { at: to_world(car, { x: rear, y: half }), angle: angle(rear, half, both || rear_steer) },
  ];
}

/** Null driving straight, crabbing, or with a skid steer's tracks level. */
export function turn_centre(car: Car, spec: VehicleSpec = HATCHBACK): Vec | null {
  const drive = spec.drive;
  let curvature: number;
  if (drive.kind === DriveKind.SKID) curvature = (2 * car.steer) / (drive.track * (1 - Math.abs(car.steer)));
  else if (drive.kind === DriveKind.FRAME) {
    const behind = spec.wheelbase - drive.pivot;
    curvature = Math.sin(car.steer) / (behind * Math.cos(car.steer) + drive.pivot);
  } else if (crabbing(car, spec)) return null;
  else curvature = Math.tan(car.steer) / steer_base(spec);
  if (!(Math.abs(curvature) >= 1e-9)) return null;
  return to_world(car, { x: 0, y: 1 / curvature });
}

export function sweep(car: Car, distance: number, samples: number, spec: VehicleSpec = HATCHBACK): Vec[][] {
  if (spec.drive.kind !== DriveKind.ACKERMANN || crabbing(car, spec)) {
    const paths: Vec[][] = [[], [], [], []];
    for (let i = 0; i <= samples; i++) {
      const placed = travel(car, car.steer, (distance * i) / samples, spec, car.crab);
      outline(placed, spec).forEach((point, k) => paths[k].push(point));
    }
    return paths;
  }
  const curvature = Math.tan(car.steer) / steer_base(spec);
  const local = body_local(spec);
  const paths: Vec[][] = local.map(() => []);
  for (let i = 0; i <= samples; i++) {
    const s = (distance * i) / samples;
    const pose = arc(car, curvature, s);
    local.forEach((point, k) => paths[k].push(to_world(pose, point)));
  }
  return paths;
}

// The last trailer's tail leads reversing, or forward when it hangs ahead: its corners show the chain folding away well before it does.
export function trailer_sweep(car: Car, distance: number, samples: number, vehicle: VehicleSpec): Vec[][] {
  const last = vehicle.hitches.length - 1;
  const curvature = Math.tan(car.steer) / steer_base(vehicle);
  const local = trailer_local(vehicle.hitches[last]).slice(2);
  const paths: Vec[][] = local.map(() => []);
  let placement: Placement = {
    x: car.x,
    y: car.y,
    heading: car.heading,
    trailers: car.trailers ?? rest_trailers(car.heading, vehicle),
  };
  for (let i = 0; i <= samples; i++) {
    const placed = trailer_pose(placement, vehicle, last);
    local.forEach((point, k) => paths[k].push(to_world(placed, point)));
    if (jackknifed(placement, vehicle)) break;
    const ds = distance / samples;
    placement = { ...arc(placement, curvature, ds), trailers: tow(placement, placement.trailers!, curvature, ds, vehicle.hitches) };
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
