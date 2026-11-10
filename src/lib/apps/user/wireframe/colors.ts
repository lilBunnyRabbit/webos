import { is_hex, type Axis, type Ink, type LineColor } from "./model";

// Full class names: Tailwind only compiles classes it finds written out.
export const AXIS_STROKE: Record<Axis, string> = {
  x: "stroke-accent",
  y: "stroke-secondary",
  z: "stroke-tertiary",
};

export const AXIS_FILL: Record<Axis, string> = {
  x: "fill-accent",
  y: "fill-secondary",
  z: "fill-tertiary",
};

export const AXIS_BG: Record<Axis, string> = {
  x: "bg-accent",
  y: "bg-secondary",
  z: "bg-tertiary",
};

export const SWATCH: Record<LineColor, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
};

export function ink_css(color: Ink): string {
  if (color === null) return "var(--foreground)";
  return is_hex(color) ? color : `var(--${color})`;
}

// The ink is the strongest colour, so it gets less of the face; both stay opaque, so a face hides what's behind it.
export function face_tint(color: Ink): number {
  return color === null ? 0.12 : 0.24;
}

export function face_css(color: Ink): string {
  return `color-mix(in srgb, ${ink_css(color)} ${face_tint(color) * 100}%, var(--background))`;
}

export function ink_label(color: Ink): string {
  if (color === null) return "Ink";
  return is_hex(color) ? color : color[0].toUpperCase() + color.slice(1);
}
