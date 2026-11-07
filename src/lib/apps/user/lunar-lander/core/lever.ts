export interface Detent {
  label: string;
  name: string;
  throttle: number;
}

export const HOVER_NOTCH = 3;

/**
 * The lever's notches, bottom to top, around the throttle that hovers the ship as it is now (body, cargo): it moves as
 * the load changes, so Hover always holds, Sink always sinks.
 */
export function detents(hover: number): Detent[] {
  const h = Math.min(0.97, hover);
  return [
    { label: "Off", name: "Off", throttle: 0 },
    { label: "Low", name: "Low", throttle: 0.5 * h },
    { label: "Sink", name: "Sink", throttle: 0.8 * h },
    { label: "Hov", name: "Hover", throttle: h },
    { label: "Rise", name: "Rise", throttle: h + 0.35 * (1 - h) },
    { label: "Full", name: "Full", throttle: 1 },
  ];
}
