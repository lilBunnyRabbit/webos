import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export interface SettingsService extends IService {
  taskbar: Taskbar;
  theme: Theme;
  /** Extension (`".svg"`) → app chosen with "Always use" in the Open-with dropdown (ADR-018). */
  file_defaults: FileDefaults;
  /** Desktop and phone home background (ADR-011 revision). Assign a preset directly; images go through `set_wallpaper_image`. */
  wallpaper: Wallpaper;
  /** Themes the user named, in the order saved. Change it through `with_saved` / `without_saved` / `renamed_saved`. */
  saved_themes: SavedTheme[];
  /** Non-colour look: corners, shadows, text size and motion (ADR-015 revision). Not part of a theme, so presets and saved themes leave it alone. */
  appearance: Appearance;
  /** Copies the image (a path or a device file) to `/var/lib/wallpaper/` and makes it the wallpaper, keeping fit, dim and blur. */
  set_wallpaper_image(source: string | File): Promise<void>;
}

export type FileDefaults = Record<string, AppId>;

export interface Taskbar {
  position: TaskbarPosition;
  /** Quick launch, in order (ADR-042). Change it through `with_pin` / `without_pin`. */
  pinned: AppId[];
  /** Item size; the bar, icons and gaps follow it (ADR-015). */
  size: TaskbarSize;
  /** The bar overlays the screen edge, hidden until the pointer reaches it (ADR-015). */
  auto_hide: boolean;
}

export const TaskbarSize = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
} as const;
export type TaskbarSize = (typeof TaskbarSize)[keyof typeof TaskbarSize];

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

export interface SavedTheme {
  name: string;
  theme: Theme;
}
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

export const AppearanceRadius = {
  SHARP: "sharp",
  DEFAULT: "default",
  ROUND: "round",
} as const;
export type AppearanceRadius = (typeof AppearanceRadius)[keyof typeof AppearanceRadius];

/** `off` stops animations and transitions; `system` follows the OS reduced-motion setting, which always wins. */
export const AppearanceMotion = {
  SYSTEM: "system",
  OFF: "off",
} as const;
export type AppearanceMotion = (typeof AppearanceMotion)[keyof typeof AppearanceMotion];

export const AppearanceShadow = {
  NONE: "none",
  SUBTLE: "subtle",
  DEFAULT: "default",
  STRONG: "strong",
} as const;
export type AppearanceShadow = (typeof AppearanceShadow)[keyof typeof AppearanceShadow];

export const AppearanceText = {
  S: "s",
  M: "m",
  L: "l",
} as const;
export type AppearanceText = (typeof AppearanceText)[keyof typeof AppearanceText];

export interface Appearance {
  radius: AppearanceRadius;
  motion: AppearanceMotion;
  shadow: AppearanceShadow;
  text: AppearanceText;
}
