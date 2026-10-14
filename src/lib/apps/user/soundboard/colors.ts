import type { PadColor } from "./board";

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

export const TILE: Record<PadColor, { idle: string; playing: string; bar: string }> = {
  primary: { idle: "bg-primary/18 ring-primary/35 hover:bg-primary/26", playing: "bg-primary/38 ring-primary", bar: "bg-primary" },
  secondary: { idle: "bg-secondary/18 ring-secondary/35 hover:bg-secondary/26", playing: "bg-secondary/38 ring-secondary", bar: "bg-secondary" },
  tertiary: { idle: "bg-tertiary/18 ring-tertiary/35 hover:bg-tertiary/26", playing: "bg-tertiary/38 ring-tertiary", bar: "bg-tertiary" },
  accent: { idle: "bg-accent/18 ring-accent/35 hover:bg-accent/26", playing: "bg-accent/38 ring-accent", bar: "bg-accent" },
  info: { idle: "bg-info/18 ring-info/35 hover:bg-info/26", playing: "bg-info/38 ring-info", bar: "bg-info" },
  success: { idle: "bg-success/18 ring-success/35 hover:bg-success/26", playing: "bg-success/38 ring-success", bar: "bg-success" },
  warning: { idle: "bg-warning/18 ring-warning/35 hover:bg-warning/26", playing: "bg-warning/38 ring-warning", bar: "bg-warning" },
};
