import type { IService } from "../../type";

export interface SettingsService extends IService {
  taskbar: Taskbar;
  theme: Theme;
}

export interface Taskbar {
  position: TaskbarPosition;
}

export const TaskbarPosition = {
  TOP: "top",
  BOTTOM: "bottom",
  LEFT: "left",
  RIGHT: "right",
} as const;
export type TaskbarPosition = (typeof TaskbarPosition)[keyof typeof TaskbarPosition];

export type Theme = Record<"background" | "foreground" | "primary" | "secondary" | "accent", string>;
