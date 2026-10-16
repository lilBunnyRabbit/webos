import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export interface SettingsService extends IService {
  taskbar: Taskbar;
  theme: Theme;
  /** Extension (`".svg"`) → app chosen with "Always use" in the Open-with dropdown (ADR-018). */
  file_defaults: FileDefaults;
  /** Desktop and phone home background (ADR-011 revision). Assign a preset directly; images go through `set_wallpaper_image`. */
  wallpaper: Wallpaper;
  /** Copies the image (a path or a device file) to `/var/lib/wallpaper/` and makes it the wallpaper, keeping fit, dim and blur. */
  set_wallpaper_image(source: string | File): Promise<void>;
}

export type FileDefaults = Record<string, AppId>;

export interface Taskbar {
  position: TaskbarPosition;
  /** Quick launch, in order (ADR-042). Change it through `with_pin` / `without_pin`. */
  pinned: AppId[];
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

export const WallpaperPreset = {
  GRID: "grid",
  GLOW: "glow",
  TINT: "tint",
  PLAIN: "plain",
} as const;
export type WallpaperPreset = (typeof WallpaperPreset)[keyof typeof WallpaperPreset];

export const WallpaperFit = {
  FILL: "fill",
  FIT: "fit",
  TILE: "tile",
  CENTER: "center",
} as const;
export type WallpaperFit = (typeof WallpaperFit)[keyof typeof WallpaperFit];

export type Wallpaper =
  | { kind: "preset"; preset: WallpaperPreset }
  /** `dim` 0–0.6 fades toward the theme's darkest surface; `blur` in px, 0–20. */
  | { kind: "image"; path: string; fit: WallpaperFit; dim: number; blur: number };
