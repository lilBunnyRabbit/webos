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
  /** Options of each live wallpaper used, by id, kept when switching away (ADR-057). Replace an entry wholesale; load parses each with its wallpaper's schema. */
  live_options: LiveOptions;
  /** Whether usage stats may use cookies (ADR-070). Mirrored to localStorage so `index.html` can read it before OPFS. */
  analytics: AnalyticsConsent;
  /** Voice and speed every app's speech uses (ADR-074). */
  speech: SpeechSettings;
  /** Copies the image (a path or a device file) to `/var/lib/wallpaper/` and makes it the wallpaper, keeping fit, dim and blur. */
  set_wallpaper_image(source: string | File): Promise<void>;
  /**
   * Copies a font file (a path or a device file; `.ttc`, `.ttf`, `.otf`, `.woff`, `.woff2`) to `/etc/fonts/`, replacing
   * one with the same name, and makes it the font of `role`. Every face of a collection loads with its own weight and style.
   */
  use_font(role: FontRole, source: string | File): Promise<void>;
  /** Deletes a font from `/etc/fonts/`; a role that used it goes back to the default. */
  remove_font(name: string): Promise<void>;
  /** Font files in `/etc/fonts/`, by name. */
  installed_fonts(): Promise<string[]>;
}

export interface SpeechSettings {
  /** A voice's `voiceURI`; `null` is the browser's default for the page language. */
  voice: string | null;
  /** 0.5 to 2; 1 is normal speed. */
  rate: number;
}

export const AnalyticsConsent = {
  UNASKED: "unasked",
  ALLOWED: "allowed",
  DECLINED: "declined",
} as const;
export type AnalyticsConsent = (typeof AnalyticsConsent)[keyof typeof AnalyticsConsent];

export type FileDefaults = Record<string, AppId>;

export interface Taskbar {
  position: TaskbarPosition;
  /** Quick launch, in order (ADR-042). Change it through `with_pin` / `without_pin`. */
  pinned: AppId[];
  /** Item size; the bar, icons and gaps follow it (ADR-015). */
  size: TaskbarSize;
  /** The bar overlays the screen edge, hidden until the pointer reaches it (ADR-015). */
  auto_hide: boolean;
  /** The clock shows seconds too. */
  seconds: boolean;
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

export type LiveWallpaperId = string;

export type LiveOptions = Partial<Record<LiveWallpaperId, unknown>>;

export type Wallpaper =
  | { kind: "preset"; preset: WallpaperPreset }
  /** `dim` 0–0.6 fades toward the theme's darkest surface; `blur` in px, 0–20. */
  | { kind: "image"; path: string; fit: WallpaperFit; dim: number; blur: number }
  /** Desktop only: mobile draws the grid in its place (ADR-057). */
  | { kind: "live"; id: LiveWallpaperId };

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
  font: AppearanceFont;
}

/** `sans` is the UI font (`--font-sans`), `mono` the code font (`--font-mono`). */
export const FontRole = {
  SANS: "sans",
  MONO: "mono",
} as const;
export type FontRole = (typeof FontRole)[keyof typeof FontRole];

/** Inter or Hack, a font that ships with WebOS (`BUILTIN_FONTS`), or a family file copied into `/etc/fonts`. */
export type FontChoice = { kind: "default" } | { kind: "builtin"; id: string } | { kind: "file"; name: string };

export type AppearanceFont = Record<FontRole, FontChoice>;
