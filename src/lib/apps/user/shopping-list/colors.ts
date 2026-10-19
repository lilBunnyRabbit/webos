import type { ListColor } from "./data";

// Full class names: Tailwind only compiles classes it finds written out.
export const COLOR_DOT: Record<ListColor, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
};

export const COLOR_NAME: Record<ListColor, string> = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
  accent: "Accent",
  info: "Blue",
  success: "Green",
  warning: "Amber",
};
