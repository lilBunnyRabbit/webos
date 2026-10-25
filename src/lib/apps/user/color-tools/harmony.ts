import type { Color } from "@lilbunnyrabbit/chromatics";
import { Hsl } from "@lilbunnyrabbit/chromatics/hsl";
import { Okhsl } from "@lilbunnyrabbit/chromatics/okhsl";
import { Oklch } from "@lilbunnyrabbit/chromatics/oklch";

export const HueSpace = { OKLCH: "oklch", OKHSL: "okhsl", HSL: "hsl" } as const;
export type HueSpace = (typeof HueSpace)[keyof typeof HueSpace];

export const HUE_SPACES: { value: HueSpace; label: string }[] = [
  { value: HueSpace.OKLCH, label: "OKLCH" },
  { value: HueSpace.OKHSL, label: "Okhsl" },
  { value: HueSpace.HSL, label: "HSL" },
];

const SPACE_MODELS = { [HueSpace.OKLCH]: Oklch, [HueSpace.OKHSL]: Okhsl, [HueSpace.HSL]: Hsl };

export const RAMP_SIZE = 9;
export const MIN_STEPS = 3;
export const MAX_STEPS = 12;

export interface Harmony {
  id: string;
  label: string;
  colors: Color[];
}

export function harmonies(color: Color, space: HueSpace): Harmony[] {
  const base = color.to(SPACE_MODELS[space]);
  return [
    { id: "complement", label: "Complement", colors: [base.clone(), base.clone().complement()] },
    { id: "triadic", label: "Triadic", colors: base.triadic() },
    { id: "tetradic", label: "Tetradic", colors: base.tetradic() },
    { id: "square", label: "Square", colors: base.square() },
    { id: "split", label: "Split complementary", colors: base.splitComplementary() },
    { id: "analogous", label: "Analogous", colors: base.analogous() },
    { id: "ramp", label: "Ramp", colors: base.ramp(RAMP_SIZE) },
  ];
}

export function steps_between(from: Color, to: Color, count: number, space: HueSpace): Color[] {
  const n = Math.round(Math.min(MAX_STEPS, Math.max(MIN_STEPS, count)));
  if (space === HueSpace.HSL) return from.to(Hsl).steps(to.to(Hsl), n);
  if (space === HueSpace.OKHSL) return from.to(Okhsl).steps(to.to(Okhsl), n);
  return from.to(Oklch).steps(to.to(Oklch), n);
}
