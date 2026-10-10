import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export interface SettingsService extends IService {
  taskbar: Taskbar;
  theme: Theme;
  /** Extension (`".svg"`) → app chosen with "Always use" in the Open-with dropdown (ADR-018). */
  file_defaults: FileDefaults;
}

export type FileDefaults = Record<string, AppId>;

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

export type ThemeBaseToken = "background" | "foreground" | "primary" | "secondary" | "accent";
export type ThemeToken = ThemeBaseToken | "tertiary" | "cottontail" | "success" | "warning" | "error" | "info";

export type ThemeBase = Record<ThemeBaseToken, string>;
export type Theme = Record<ThemeToken, string>;
