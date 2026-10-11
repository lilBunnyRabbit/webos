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
/** The brand's surface ladder around `background` (lightest at the top). Written as `--background-dark` etc. */
export type ThemeSurfaceToken =
  | "background_lightest"
  | "background_lighter"
  | "background_light"
  | "background_dark"
  | "background_darker"
  | "background_darkest";
export type ThemeToken =
  | ThemeBaseToken
  | ThemeSurfaceToken
  | "tertiary"
  | "cottontail"
  | "success"
  | "warning"
  | "error"
  | "info";

export type ThemeBase = Record<ThemeBaseToken, string>;
export type Theme = Record<ThemeToken, string>;
