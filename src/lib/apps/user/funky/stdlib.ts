export interface StdlibFunction {
  name: string;
  signature: string;
  detail: string;
  source: string;
}

export const STDLIB: StdlibFunction[] = [
  {
    name: "deadzone",
    signature: "deadzone(x, dz)",
    detail: "Zero when x is within ±dz: ignores stick noise around the centre.",
    source: "fn deadzone(x, dz) = abs(x) > dz ? x : 0",
  },
  {
    name: "expo",
    signature: "expo(x, e)",
    detail: "Softer response near the centre. e from 0 (linear) to 1 (cubic).",
    source: "fn expo(x, e) = x * (e * x * x + (1 - e))",
  },
  {
    name: "wrap180",
    signature: "wrap180(a)",
    detail: "Wraps an angle into −180 … 180.",
    source: "fn wrap180(a) = a - 360 * floor((a + 180) / 360)",
  },
  {
    name: "headingError",
    signature: "headingError(target)",
    detail: "Shortest signed turn, in degrees, from Heading to a target heading.",
    source: "fn headingError(target) = wrap180(target - Heading)",
  },
  {
    name: "bool01",
    signature: "bool01(x)",
    detail: "A clean 0 or 1 from a condition, whatever false coerces to.",
    source: "fn bool01(x) = clamp01(x)",
  },
  {
    name: "scaleBySpeed",
    signature: "scaleBySpeed(x, v0)",
    detail: "Less authority as IAS rises towards v0 (m/s).",
    source: "fn scaleBySpeed(x, v0) = x * clamp(1 - IAS / v0, 0, 1)",
  },
  {
    name: "pidHold",
    signature: "pidHold(target, current, p, i, d)",
    detail: "PID with its arguments named. Each call is its own controller.",
    source: "fn pidHold(target, current, p, i, d) = PID(target, current, p, i, d)",
  },
];

export const STDLIB_SOURCE = STDLIB.map((entry) => entry.source).join("\n");
