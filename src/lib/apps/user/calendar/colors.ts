import type { EventColor } from "./calendar";

// Opaque, so an event drawn over a worked-hours block hides it.
export const EVENT_CHIP: Record<EventColor, string> = {
  primary: "bg-[color-mix(in_oklch,var(--primary)_18%,var(--background))] border-primary",
  info: "bg-[color-mix(in_oklch,var(--info)_18%,var(--background))] border-info",
  success: "bg-[color-mix(in_oklch,var(--success)_18%,var(--background))] border-success",
  warning: "bg-[color-mix(in_oklch,var(--warning)_18%,var(--background))] border-warning",
  error: "bg-[color-mix(in_oklch,var(--error)_18%,var(--background))] border-error",
  accent: "bg-[color-mix(in_oklch,var(--accent)_18%,var(--background))] border-accent",
};

export const EVENT_DOT: Record<EventColor, string> = {
  primary: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  accent: "bg-accent",
};

export const COLOR_NAMES: Record<EventColor, string> = {
  primary: "Brand",
  info: "Blue",
  success: "Green",
  warning: "Amber",
  error: "Red",
  accent: "Accent",
};
