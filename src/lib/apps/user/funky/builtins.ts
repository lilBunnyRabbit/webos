// Names and ranges follow the funkyguide (snowflake0s.github.io/funkyguide); the function table matches the one in
// SimplePlanes' own code, which maps each function onto Unity's Mathf.

export const ValueType = { NUMBER: "number", BOOL: "bool", STRING: "string" } as const;
export type ValueType = (typeof ValueType)[keyof typeof ValueType];

export const Control = { SLIDER: "slider", TOGGLE: "toggle", TEXT: "text" } as const;
export type Control = (typeof Control)[keyof typeof Control];

export interface SimControl {
  control: Control;
  min: number;
  max: number;
  step: number;
  initial: number | string;
  values?: [number, number];
  unit?: string;
}

export interface BuiltinVariable {
  name: string;
  type: ValueType;
  range: string;
  group: string;
  detail: string;
  sim: SimControl;
  deprecated?: string;
}

const axis = (initial = 0): SimControl => ({ control: Control.SLIDER, min: -1, max: 1, step: 0.01, initial });
const boolean = (): SimControl => ({ control: Control.TOGGLE, min: -1, max: 1, step: 1, initial: -1, values: [1, -1] });
const zero_one = (): SimControl => ({ control: Control.TOGGLE, min: 0, max: 1, step: 1, initial: 0, values: [1, 0] });
const slider = (min: number, max: number, step: number, initial: number, unit?: string): SimControl => ({
  control: Control.SLIDER,
  min,
  max,
  step,
  initial,
  unit,
});

const variable = (name: string, type: ValueType, range: string, group: string, detail: string, sim: SimControl, deprecated?: string): BuiltinVariable => ({
  name,
  type,
  range,
  group,
  detail,
  sim,
  deprecated,
});

const N = ValueType.NUMBER;
const B = ValueType.BOOL;

export const BUILTIN_VARIABLES: BuiltinVariable[] = [
  variable("Pitch", N, "−1 … 1", "Inputs", "Pitch input. −1, 0 or 1 on a keyboard, continuous on a stick.", axis()),
  variable("Roll", N, "−1 … 1", "Inputs", "Roll input.", axis()),
  variable("Yaw", N, "−1 … 1", "Inputs", "Yaw input.", axis()),
  variable("Throttle", N, "0 … 1", "Inputs", "Throttle. The one main axis that starts at 0.", slider(0, 1, 0.01, 0)),
  variable("Trim", N, "−1 … 1", "Inputs", "Trim setting.", axis()),
  variable("VTOL", N, "−1 … 1", "Inputs", "VTOL slider.", axis()),
  variable(
    "Brake",
    N,
    "0 / 1",
    "Inputs",
    "Whether the brake is held. The funkyguide says 0 or 1, the 1.9.202 notes call it a boolean (−1 when off): wrap it in clamp01() to be safe.",
    zero_one()
  ),
  variable("GearDown", B, "true / false", "Inputs", "Landing gear down.", boolean()),
  variable("LandingGear", N, "0 / 1", "Inputs", "Landing gear, the old name. Use GearDown.", zero_one(), "GearDown"),
  variable("FireGuns", B, "true / false", "Weapons", "Fire guns held.", boolean()),
  variable("FireWeapons", B, "true / false", "Weapons", "Fire weapons held.", boolean()),
  variable("LaunchCountermeasures", B, "true / false", "Weapons", "Countermeasures button held.", boolean()),
  variable("SelectedWeapon", ValueType.STRING, "text", "Weapons", 'Name of the weapon selected in the weapons drawer, like "Boom 50". Works with ammo().', {
    control: Control.TEXT,
    min: 0,
    max: 0,
    step: 0,
    initial: "Boom 50",
  }),
  ...Array.from({ length: 8 }, (_, index) =>
    variable(`Activate${index + 1}`, B, "true / false", "Activation groups", `Activation group ${index + 1}.`, boolean())
  ),
  variable("Altitude", N, "m", "Flight", "Altitude above sea level.", slider(0, 10000, 10, 1000, "m")),
  variable("AltitudeAgl", N, "m", "Flight", "Altitude above the ground.", slider(0, 2000, 1, 500, "m")),
  variable("GS", N, "m/s, 0 … ∞", "Flight", "Ground speed.", slider(0, 400, 1, 100, "m/s")),
  variable("IAS", N, "m/s, 0 … ∞", "Flight", "Indicated airspeed.", slider(0, 400, 1, 100, "m/s")),
  variable("TAS", N, "m/s, 0 … ∞", "Flight", "True airspeed: airspeed adjusted for air density.", slider(0, 400, 1, 100, "m/s")),
  variable("VerticalSpeed", N, "m/s", "Flight", "Climb (+) or sink (−) rate.", slider(-100, 100, 0.5, 0, "m/s")),
  variable("Fuel", N, "0 … 1", "Flight", "Fuel left, as a share of capacity.", slider(0, 1, 0.01, 1)),
  variable("GForce", N, "g, 0 … ∞", "Flight", "G-force on the pilot, in every direction.", slider(0, 10, 0.1, 1, "g")),
  variable("VerticalG", N, "g", "Flight", "The vertical part of the G-force.", slider(-5, 10, 0.1, 1, "g")),
  variable("Time", N, "s", "Flight", "Seconds since the level loaded. The simulator's clock.", slider(0, 0, 0, 0, "s")),
  variable("Heading", N, "−180 … 180°", "Attitude", "Compass heading. −180 … 180, not 0 … 360.", slider(-180, 180, 1, 0, "°")),
  variable("PitchAngle", N, "−90 … 90°", "Attitude", "Nose up (+) or down (−). Not the Pitch input.", slider(-90, 90, 1, 0, "°")),
  variable("RollAngle", N, "−180 … 180°", "Attitude", "Bank angle. Not the Roll input.", slider(-180, 180, 1, 0, "°")),
  variable("AngleOfAttack", N, "−180 … 180°", "Attitude", "Angle the airflow meets the nose, vertically.", slider(-30, 30, 0.5, 0, "°")),
  variable("AngleOfSlip", N, "−180 … 180°", "Attitude", "The sideways angle of attack.", slider(-30, 30, 0.5, 0, "°")),
  variable("PitchRate", N, "°/s", "Rates", "Pitch rotation speed, in the craft's own frame. Better than rate(PitchAngle).", slider(-180, 180, 1, 0, "°/s")),
  variable("RollRate", N, "°/s", "Rates", "Roll rotation speed.", slider(-180, 180, 1, 0, "°/s")),
  variable("YawRate", N, "°/s", "Rates", "Yaw rotation speed. Better than rate(Heading), which jumps at ±180.", slider(-180, 180, 1, 0, "°/s")),
  variable("Latitude", N, "m", "Position", "The craft's y position on the sandbox map.", slider(-50000, 50000, 10, 0, "m")),
  variable("Longitude", N, "m", "Position", "The craft's x position on the sandbox map.", slider(-50000, 50000, 10, 0, "m")),
  variable("TargetSelected", B, "true / false", "Targeting", "Whether a target is selected.", boolean()),
  variable("TargetHeading", N, "0 … 360°", "Targeting", "World bearing to the target, not relative to Heading.", slider(0, 360, 1, 0, "°")),
  variable("TargetElevation", N, "−90 … 90°", "Targeting", "World angle up or down to the target, not relative to PitchAngle.", slider(-90, 90, 1, 0, "°")),
  variable("TargetDistance", N, "m, 0 … ∞", "Targeting", "Distance to the target.", slider(0, 20000, 10, 2000, "m")),
];

export const VARIABLES_BY_NAME = new Map(BUILTIN_VARIABLES.map((entry) => [entry.name, entry]));

export interface BuiltinFunction {
  name: string;
  arity: number;
  signature: string;
  group: string;
  detail: string;
  stateful?: boolean;
}

const fn = (name: string, arity: number, signature: string, group: string, detail: string, stateful = false): BuiltinFunction => ({
  name,
  arity,
  signature,
  group,
  detail,
  stateful,
});

export const BUILTIN_FUNCTIONS: BuiltinFunction[] = [
  fn("abs", 1, "abs(x)", "Math", "Absolute value."),
  fn("ceil", 1, "ceil(x)", "Math", "Rounds up."),
  fn("floor", 1, "floor(x)", "Math", "Rounds down."),
  fn("round", 1, "round(x)", "Math", "Rounds to the nearest whole number."),
  fn("sign", 1, "sign(x)", "Math", "1 when x is positive, −1 when negative."),
  fn("sqrt", 1, "sqrt(x)", "Math", "Square root."),
  fn("exp", 1, "exp(x)", "Math", "e to the power x."),
  fn("pow", 2, "pow(x, p)", "Math", "x to the power p."),
  fn("log", 2, "log(x, base)", "Math", "Logarithm of x in a base."),
  fn("log10", 1, "log10(x)", "Math", "Base-10 logarithm."),
  fn("min", 2, "min(a, b)", "Math", "The smaller of a and b."),
  fn("max", 2, "max(a, b)", "Math", "The larger of a and b."),
  fn("clamp", 3, "clamp(x, min, max)", "Math", "Keeps x inside [min, max]."),
  fn("clamp01", 1, "clamp01(x)", "Math", "Keeps x inside [0, 1]: turns a condition into a clean 0 or 1."),
  fn("lerp", 3, "lerp(a, b, t)", "Interpolation", "From a to b by t, with t kept inside [0, 1]."),
  fn("lerpunclamped", 3, "lerpunclamped(a, b, t)", "Interpolation", "Like lerp, but t isn't clamped."),
  fn("lerpangle", 3, "lerpangle(a, b, t)", "Interpolation", "Like lerp for angles: goes the short way round 360°."),
  fn("inverselerp", 3, "inverselerp(a, b, x)", "Interpolation", "Where x sits between a and b, as 0 … 1."),
  fn("smoothstep", 3, "smoothstep(a, b, t)", "Interpolation", "Like lerp, eased in and out."),
  fn("deltaangle", 2, "deltaangle(a, b)", "Interpolation", "Shortest signed turn from a to b, in degrees."),
  fn("pingpong", 2, "pingpong(x, l)", "Interpolation", "Bounces x back and forth between 0 and l."),
  fn("repeat", 2, "repeat(x, l)", "Interpolation", "Wraps x into 0 … l, like a sawtooth."),
  fn("sin", 1, "sin(degrees)", "Trig (degrees)", "Sine. Takes degrees."),
  fn("cos", 1, "cos(degrees)", "Trig (degrees)", "Cosine. Takes degrees."),
  fn("tan", 1, "tan(degrees)", "Trig (degrees)", "Tangent. Takes degrees."),
  fn("asin", 1, "asin(x)", "Trig (degrees)", "Arc sine, in degrees."),
  fn("acos", 1, "acos(x)", "Trig (degrees)", "Arc cosine, in degrees."),
  fn("atan", 1, "atan(x)", "Trig (degrees)", "Arc tangent, in degrees."),
  fn("atan2", 2, "atan2(y, x)", "Trig (degrees)", "Angle of the point (x, y), in degrees."),
  fn("rate", 1, "rate(x)", "Time (stateful)", "How fast x changes, per second.", true),
  fn("sum", 1, "sum(x)", "Time (stateful)", "x added up over time since the level loaded. Never resets.", true),
  fn("smooth", 2, "smooth(x, speed)", "Time (stateful)", "Follows x, moving at most `speed` units a second. A speed of 0 holds the value.", true),
  fn("PID", 5, "PID(target, current, p, i, d)", "Time (stateful)", "PID controller: p·(target − current) + i·sum(target − current) − d·rate(current).", true),
  fn("ammo", 1, 'ammo("Weapon")', "Weapons", 'Ammo left in the named weapon. Takes a string such as "Boom 50", or SelectedWeapon.'),
];

export const FUNCTIONS_BY_NAME = new Map(BUILTIN_FUNCTIONS.map((entry) => [entry.name, entry]));

export const STATEFUL_FUNCTIONS = new Set(BUILTIN_FUNCTIONS.filter((entry) => entry.stateful).map((entry) => entry.name));

export const BUILTIN_CONSTANTS: Record<string, number> = { PI: Math.PI, E: Math.E };

export const count_text = (count: number) => `${count} argument${count === 1 ? "" : "s"}`;

export const is_builtin_name = (name: string) => VARIABLES_BY_NAME.has(name) || name in BUILTIN_CONSTANTS;
