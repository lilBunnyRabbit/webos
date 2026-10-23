import { is_hex, type PadColor, type PadTint } from "./board";

// Full class names: Tailwind only compiles classes it finds written out.
export const SWATCH: Record<PadColor, string> = {
  primary: "bg-primary ring-primary",
  secondary: "bg-secondary ring-secondary",
  tertiary: "bg-tertiary ring-tertiary",
  accent: "bg-accent ring-accent",
  info: "bg-info ring-info",
  success: "bg-success ring-success",
  warning: "bg-warning ring-warning",
};

export const TILE = {
  idle: "bg-(color:--pad)/18 shadow-control ring-(color:--pad)/35 hover:bg-(color:--pad)/26 active:shadow-pressed",
  playing: "bg-(color:--pad)/38 shadow-pressed ring-(color:--pad)",
  bar: "bg-(color:--pad)",
};

export function pad_tone(color: PadTint): string {
  return is_hex(color) ? color : `var(--${color})`;
}
