import type { Color } from "@lilbunnyrabbit/chromatics";
import { simulateCvd, type Deficiency as PackageDeficiency } from "@lilbunnyrabbit/chromatics/cvd";
import { Srgb } from "@lilbunnyrabbit/chromatics/srgb";

export const Deficiency = { PROTAN: "protan", DEUTAN: "deutan", TRITAN: "tritan" } as const satisfies Record<string, PackageDeficiency>;
export type Deficiency = (typeof Deficiency)[keyof typeof Deficiency];

export const DEFICIENCIES: { value: Deficiency; label: string; cones: string }[] = [
  { value: Deficiency.PROTAN, label: "Protan", cones: "Red-sensitive cones" },
  { value: Deficiency.DEUTAN, label: "Deutan", cones: "Green-sensitive cones" },
  { value: Deficiency.TRITAN, label: "Tritan", cones: "Blue-sensitive cones" },
];

// The model applies to what the screen shows, so an out-of-gamut colour is mapped into sRGB first.
export function simulate(color: Color, deficiency: Deficiency, severity: number): Color {
  return simulateCvd(color.to(Srgb).gamutMap(), deficiency, Math.min(1, Math.max(0, severity)));
}

/** Severity 1 is the dichromacy (protanopia), anything less the anomalous trichromacy (protanomaly). */
export function severity_name(deficiency: Deficiency, severity: number): string {
  if (severity <= 0) return "Normal vision";
  const stem = DEFICIENCIES.find((item) => item.value === deficiency)!.label;
  return severity >= 1 ? `${stem}opia` : `${stem}omaly`;
}
