import { format_date } from "$lib/core/utils";
import { days_between, DueState, LabelColor } from "./data";

// Whole class names, so Tailwind sees them.
export const LABEL_CHIP: Record<LabelColor, string> = {
  [LabelColor.PRIMARY]: "bg-primary/15 text-primary",
  [LabelColor.INFO]: "bg-info/15 text-info",
  [LabelColor.SUCCESS]: "bg-success/15 text-success",
  [LabelColor.WARNING]: "bg-warning/15 text-warning",
  [LabelColor.ERROR]: "bg-error/15 text-error",
  [LabelColor.ACCENT]: "bg-accent/15 text-accent",
};

export const LABEL_DOT: Record<LabelColor, string> = {
  [LabelColor.PRIMARY]: "bg-primary",
  [LabelColor.INFO]: "bg-info",
  [LabelColor.SUCCESS]: "bg-success",
  [LabelColor.WARNING]: "bg-warning",
  [LabelColor.ERROR]: "bg-error",
  [LabelColor.ACCENT]: "bg-accent",
};

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  [LabelColor.PRIMARY]: "Primary",
  [LabelColor.INFO]: "Info",
  [LabelColor.SUCCESS]: "Success",
  [LabelColor.WARNING]: "Warning",
  [LabelColor.ERROR]: "Error",
  [LabelColor.ACCENT]: "Accent",
};

export const DUE_TONE = {
  [DueState.OVERDUE]: "error",
  [DueState.TODAY]: "warning",
  [DueState.SOON]: "info",
  [DueState.LATER]: "neutral",
} as const;

export function describe_due(due: string, today: string): string {
  const days = days_between(today, due);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0 && days > -7) return `${-days} days ago`;
  const [year, month, day] = due.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return year === Number(today.slice(0, 4)) ? date.toLocaleDateString([], { month: "short", day: "numeric" }) : format_date(date);
}
