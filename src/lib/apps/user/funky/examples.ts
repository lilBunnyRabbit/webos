export interface Example {
  id: string;
  name: string;
  description: string;
  source: string;
  preset: string;
  script: string;
  plot: string[];
}

export const EXAMPLES: Example[] = [
  {
    id: "autopilot",
    name: "Autopilot: altitude and heading hold",
    description:
      "Let go of the stick and smooth() captures the altitude and heading; PID loops then hold them. Stick input adds on top, so you can always take over.",
    preset: "cruise",
    script: "// The craft sinks 40 m, then the pilot climbs and lets go.\n2s Altitude = 960\n5s Pitch = 1\n6s Altitude = 1050\n7s Pitch = 0",
    plot: ["elevator", "TargetAlt", "desiredVS"],
    source: `// Hold altitude and heading whenever the stick is centred.
const VS_GAIN = 0.1   // m/s of climb per metre of altitude error

// Capture on release: smooth() stops following when its speed is 0.
var TargetAlt = smooth(Altitude, clamp01(Pitch == 0) * 1e6)
var TargetHdg = smooth(Heading, clamp01(Roll == 0) * 1e6)

var desiredVS = clamp((TargetAlt - Altitude) * VS_GAIN, -20, 20)
var pitchCmd = PID(desiredVS, VerticalSpeed, 0.05, 0.001, 0.02)
var rollCmd = PID(0, -headingError(TargetHdg), 0.02, 0, 0.01)

output elevator = clamp(pitchCmd + Pitch, -1, 1)
output aileron = clamp(rollCmd + Roll, -1, 1)
`,
  },
  {
    id: "vtol",
    name: "VTOL: nozzles and hover",
    description:
      "With the VTOL slider up and the craft slow, the nozzles swing down and the lift engines hold the climb rate the stick asks for. Speed up or lower the slider and the wing takes over again.",
    preset: "hover",
    script: "2s Pitch = 1\n4s Pitch = 0\n4s VerticalSpeed = 3\n7s VTOL = -1\n7s IAS = 60",
    plot: ["nozzles", "lift", "hover"],
    source: `// VTOL: nozzles down for hover, back for forward flight.
const HOVER_ANGLE = 90     // degrees the nozzle rotator turns
const WING_SPEED = 45      // m/s where the wing carries the craft
const CLIMB = 3            // m/s at full Pitch in a hover

var hover = clamp01(VTOL > 0) * clamp01(1 - IAS / WING_SPEED)
var nozzleAngle = smooth(hover * HOVER_ANGLE, 30)   // at most 30°/s
var liftCmd = clamp01(0.5 + PID(Pitch * CLIMB, VerticalSpeed, 0.08, 0.02, 0.01))

output nozzles = nozzleAngle / HOVER_ANGLE
output lift = hover > 0 ? liftCmd : Throttle
output elevator = (1 - hover) * Pitch
`,
  },
  {
    id: "gimbal",
    name: "Gimbal: turret on target",
    description:
      "A two-axis turret that points at the selected target in world terms, so it stays on target while the craft turns. Without a target it holds the horizon.",
    preset: "target",
    script: "2s Heading = 25\n4s PitchAngle = 10\n6s TargetSelected = off",
    plot: ["turretYaw", "turretPitch"],
    source: `// Turret gimbal: rotators take -1 … 1 for -180° … 180° (yaw) and -90° … 90° (pitch).
var yawError = deltaangle(Heading, TargetHeading)
var pitchError = TargetElevation - PitchAngle

output turretYaw = TargetSelected ? smooth(clamp(yawError / 180, -1, 1), 2) : 0
output turretPitch = clamp((TargetSelected ? pitchError : -PitchAngle) / 90, -1, 1)
`,
  },
  {
    id: "gear",
    name: "Gear logic: doors, legs and a warning",
    description:
      "Doors open before the legs come down and close only after they're up, and a light blinks when you're low and slow with the gear up. The sequencing is smooth() used as a timer.",
    preset: "approach",
    script: "1s GearDown = on\n5s GearDown = off\n9s AltitudeAgl = 80\n9s IAS = 50",
    plot: ["doors", "legs", "warningLight"],
    source: `// Gear sequencing with smooth() as a timer.
const DOOR_TIME = 1.5   // seconds for the doors
const LEG_TIME = 2      // seconds for the legs

// Doors open while the gear is wanted down, or while the legs are still out.
var doorsOpen = smooth(clamp01(GearDown | (@prev legsOut > 0.01)), 1 / DOOR_TIME)
// Legs move only once the doors are fully open.
var legsOut = smooth(clamp01(GearDown & (doorsOpen > 0.99)), 1 / LEG_TIME)
var lowAndSlow = (AltitudeAgl < 100) & (IAS < 60)

output doors = doorsOpen
output legs = legsOut
output warningLight = clamp01(!GearDown & lowAndSlow) * clamp01(sin(Time * 360) > 0)
`,
  },
  {
    id: "memory",
    name: "Latch and memory",
    description:
      "State that lasts: a toggle that flips on each trigger press, a counter, and a value captured while the trigger is held. @prev reads last tick's value, which is what makes edge detection work.",
    preset: "cruise",
    script: "1s FireGuns = on\n1.5s FireGuns = off\n2s Altitude = 1200\n3s FireGuns = on\n3.2s FireGuns = off\n4s Altitude = 900",
    plot: ["light", "counter", "heldAltitude"],
    source: `// Memory from @prev: edges, a toggle, a counter and a capture.
var held = clamp01(FireGuns)          // 1 while the trigger is down
var wasHeld = @prev held              // last tick's held
var press = held * (1 - wasHeld)      // 1 only on the tick it goes down
var toggled = abs(@prev toggled - press)
var presses = @prev presses + press
// Follows Altitude while held, keeps the last value after.
var captured = smooth(Altitude, held * 1e6)

output light = toggled
output counter = presses
output heldAltitude = captured
`,
  },
  {
    id: "weapons",
    name: "Weapon logic",
    description:
      "Guns fire only with a target in a small cone and in range, and overheat in long bursts. Past gun range the trigger launches missiles instead, if the selected weapon has ammo.",
    preset: "target",
    script: "0.5s FireGuns = on\n4s TargetDistance = 1500\n4s FireWeapons = on\n6s Ammo = 0",
    plot: ["guns", "heat", "missile"],
    source: `// Fire control: a cone, a range, overheating and a fallback to missiles.
const GUN_RANGE = 800   // m
const CONE = 4          // degrees off the nose
const HEAT_UP = 0.4     // per second of firing
const COOL = 0.25       // per second idle

var aimError = abs(deltaangle(Heading, TargetHeading)) + abs(TargetElevation - PitchAngle)
var onTarget = TargetSelected & (aimError < CONE)
var inRange = TargetDistance < GUN_RANGE
var firing = FireGuns & onTarget & inRange & (@prev heat < 1)
var heat = clamp(@prev heat + (firing ? HEAT_UP : -COOL) / 60, 0, 1)

output guns = firing
output missile = (FireWeapons | FireGuns) & onTarget & !inRange & (ammo(SelectedWeapon) > 0)
`,
  },
  {
    id: "quadcopter",
    name: "Quadcopter: self-levelling",
    description:
      "One PID per axis drives the craft's attitude to the angle the stick asks for, so letting go levels it. Four motor outputs mix throttle, pitch, roll and yaw for an X frame.",
    preset: "hover",
    script: "1s Roll = 1\n1s RollAngle = 20\n3s Roll = 0\n4s RollAngle = 0",
    plot: ["TL", "TR", "rollCmd"],
    source: `// X-frame quadcopter. Stick = lean angle; let go and it levels itself.
const ANGLE = 35    // degrees of lean at full stick
const YAW_RATE = 150
const P = 0.02
const I = 0.01
const D = 0.004

var pitchCmd = PID(Pitch * ANGLE, PitchAngle, P, I, D)
var rollCmd = PID(Roll * ANGLE, RollAngle, P, I, D)
var yawCmd = PID(Yaw * YAW_RATE, YawRate, P, I, D)

output TL = clamp01(Throttle * 0.9 + pitchCmd + rollCmd + yawCmd)
output TR = clamp01(Throttle * 0.9 + pitchCmd - rollCmd - yawCmd)
output BL = clamp01(Throttle * 0.9 - pitchCmd + rollCmd - yawCmd)
output BR = clamp01(Throttle * 0.9 - pitchCmd - rollCmd + yawCmd)
`,
  },
  {
    id: "shaping",
    name: "Input shaping",
    description: "A deadzone ignores noise around the centre, expo softens it, and authority drops as airspeed rises.",
    preset: "cruise",
    script: "1s Pitch = 0.03\n2s Pitch = 0.5\n3s Pitch = 1\n4s IAS = 200",
    plot: ["elevator"],
    source: `// Calmer stick: deadzone, expo, less authority at speed.
const DEAD = 0.04
const EXPO = 0.6

output elevator = scaleBySpeed(expo(deadzone(Pitch, DEAD), EXPO), 250)
output aileron = scaleBySpeed(expo(deadzone(Roll, DEAD), EXPO), 250)
`,
  },
];

export const NEW_FILE = `// Funky DSL: compiles to SimplePlanes Funky Trees.
// var = a setter (one shared value), output = a part's input, fn = inlined, const = folded.

var level = clamp01(Roll == 0) * PID(0, RollAngle, 0.03, 0, 0.01)

output aileron = clamp(Roll + level, -1, 1)
`;
