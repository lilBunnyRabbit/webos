import type { CardColor } from "./data";

// Full class names: Tailwind only compiles classes it finds written out.
export const SWATCH: Record<CardColor, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
};

// Scanners want dark bars on a light field, so in a dark palette the field is the foreground and the ink the darkest shade.
export const CODE_FIELD = "bg-[light-dark(var(--background-lightest),var(--foreground))]";
export const CODE_INK = "fill-[light-dark(var(--foreground),var(--background-darkest))]";
export const CODE_TEXT = "text-[light-dark(var(--foreground),var(--background-darkest))]";
