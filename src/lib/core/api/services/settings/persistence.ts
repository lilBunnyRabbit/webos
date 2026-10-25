import { z } from "zod";
import {
  AnalyticsConsent,
  AppearanceMotion,
  AppearanceRadius,
  AppearanceShadow,
  AppearanceText,
  TaskbarPosition,
  TaskbarSize,
  WallpaperFit,
  WallpaperPreset,
  type Appearance,
  type FileDefaults,
  type LiveOptions,
  type SavedTheme,
  type Taskbar,
  type Theme,
  type ThemeToken,
  type Wallpaper,
} from "./type";
import { BRAND_DARK, BRAND_LIGHT, derive_surfaces, legacy_surface, surface_step } from "./themes";
import { PATHS } from "../files/hierarchy";
import { DEFAULT_APPEARANCE } from "./appearance";
import { BUILTIN_FONTS, DEFAULT_FONT, is_font_file_name } from "./fonts";
import { LIVE_WALLPAPERS, live_options_of } from "$lib/core/components/desktop/live/registry";

/** OS config lives in system storage (ADR-021). */
export const SETTINGS_PATH = `${PATHS.etc}/settings.json`;

/** Wallpaper images are copies the OS owns, so moving or deleting the original doesn't break the wallpaper. */
export const WALLPAPER_DIRECTORY_NAME = "wallpaper";
export const WALLPAPER_DIRECTORY = `${PATHS.var_lib}/${WALLPAPER_DIRECTORY_NAME}`;

export const DEFAULT_WALLPAPER: Wallpaper = { kind: "preset", preset: WallpaperPreset.GRID };

/** Where settings lived before `/etc`; imported once, then removed. */
const LEGACY_STORAGE_KEY = "webos.settings";

/** The React version (branch `v0-react`) kept settings in a zustand store under this key. */
const V0_STORAGE_KEY = "settings";

// v0 saved its CSS defaults on first run, so a theme equal to these was never customised.
const V0_DEFAULT_THEME: Record<string, string> = {
  background: "oklch(0.26 0.0233 230.47)",
  foreground: "oklch(0.76 0.0183 99.68)",
  primary: "oklch(0.76 0.0865 123.43)",
  secondary: "oklch(0.76 0.0865 303.43)",
  accent: "oklch(0.76 0.0865 50.47)",
};

export const SETTINGS_VERSION = 1;

export interface PersistedSettings {
  version: typeof SETTINGS_VERSION;
  theme: Theme;
  taskbar: Taskbar;
  file_defaults: FileDefaults;
  wallpaper: Wallpaper;
  saved_themes: SavedTheme[];
  appearance: Appearance;
  live_options: LiveOptions;
  analytics: AnalyticsConsent;
}

// Merged over defaults so tokens added after the save still get a value.
export function parse_settings(raw: string): PersistedSettings | null {
  try {
    const data = JSON.parse(raw);
    if (data?.version !== SETTINGS_VERSION) return null;

    const position = Object.values(TaskbarPosition).includes(data.taskbar?.position)
      ? data.taskbar.position
      : TaskbarPosition.BOTTOM;

    return {
      version: SETTINGS_VERSION,
      theme: merge_theme(data.theme),
      taskbar: {
        position,
        pinned: Array.isArray(data.taskbar?.pinned) ? [...new Set<string>(data.taskbar.pinned.filter((id: unknown) => typeof id === "string"))] : [],
        // Added after version 1 shipped, like pinned: a missing or unknown value is the default.
        size: Object.values(TaskbarSize).includes(data.taskbar?.size) ? data.taskbar.size : TaskbarSize.MEDIUM,
        auto_hide: data.taskbar?.auto_hide === true,
        seconds: data.taskbar?.seconds === true,
      },
      file_defaults: sanitize_file_defaults(data.file_defaults),
      wallpaper: parse_wallpaper(data.wallpaper),
      saved_themes: parse_saved_themes(data.saved_themes),
      appearance: parse_appearance(data.appearance),
      live_options: parse_live_options(data.live_options),
      analytics: parse_analytics(data.analytics),
    };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return null;
  }
}

/** Named entries only, first of each name wins (case ignored); each theme merged like the active one. */
function parse_saved_themes(saved: unknown): SavedTheme[] {
  if (!Array.isArray(saved)) return [];
  const names = new Set<string>();
  const result: SavedTheme[] = [];
  for (const entry of saved) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!name || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    result.push({ name, theme: merge_theme(entry.theme) });
  }
  return result;
}

function merge_theme(saved: unknown): Theme {
  const source = (saved ?? {}) as Partial<Record<ThemeToken, unknown>>;
  // Tokens a save predates come from the matching brand palette, or are derived from its own background.
  const brand = [BRAND_DARK, BRAND_LIGHT].find((palette) => palette.background === source.background);
  const derived = derive_surfaces();
  const theme = { ...BRAND_DARK, ...(brand ?? derived) };
  for (const token of Object.keys(theme) as ThemeToken[]) {
    const value = source[token];
    if (typeof value !== "string") continue;
    const legacy = token in derived && value === legacy_surface(surface_step(token as keyof typeof derived));
    theme[token] = legacy ? derived[token as keyof typeof derived] : value;
  }
  return theme;
}

// Added after version 1 shipped; additive, so older saves load with no defaults instead of being discarded.
function sanitize_file_defaults(saved: unknown): FileDefaults {
  if (typeof saved !== "object" || saved === null) return {};
  const defaults: FileDefaults = {};
  for (const [extension, app_id] of Object.entries(saved)) {
    if (extension.startsWith(".") && typeof app_id === "string") defaults[extension] = app_id;
  }
  return defaults;
}

const wallpaper_schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), preset: z.enum(Object.values(WallpaperPreset)) }),
  z.object({
    kind: z.literal("image"),
    path: z.string().startsWith(`${WALLPAPER_DIRECTORY}/`),
    fit: z.enum(Object.values(WallpaperFit)).catch(WallpaperFit.FILL),
    dim: z.number().min(0).max(0.6).catch(0),
    blur: z.number().min(0).max(20).catch(0),
  }),
  z.object({ kind: z.literal("live"), id: z.string().refine((id) => Object.hasOwn(LIVE_WALLPAPERS, id)) }),
]);

// Added after version 1 shipped, like file_defaults: a missing or broken value is the default, not a lost save.
export function parse_wallpaper(saved: unknown): Wallpaper {
  const result = wallpaper_schema.safeParse(saved);
  return result.success ? result.data : DEFAULT_WALLPAPER;
}

// Additive; ids no longer in the registry are dropped, and each entry's own schema fills or fixes its fields.
export function parse_live_options(saved: unknown): LiveOptions {
  if (typeof saved !== "object" || saved === null) return {};
  const options: LiveOptions = {};
  for (const [id, value] of Object.entries(saved)) {
    if (Object.hasOwn(LIVE_WALLPAPERS, id)) options[id] = live_options_of(id, value);
  }
  return options;
}

const font_choice_schema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("default") }),
    z.object({ kind: z.literal("builtin"), id: z.string().refine((id) => Object.hasOwn(BUILTIN_FONTS, id)) }),
    z.object({ kind: z.literal("file"), name: z.string().refine(is_font_file_name) }),
  ])
  .catch(DEFAULT_FONT);

const appearance_schema = z.object({
  radius: z.enum(Object.values(AppearanceRadius)).catch(DEFAULT_APPEARANCE.radius),
  motion: z.enum(Object.values(AppearanceMotion)).catch(DEFAULT_APPEARANCE.motion),
  shadow: z.enum(Object.values(AppearanceShadow)).catch(DEFAULT_APPEARANCE.shadow),
  text: z.enum(Object.values(AppearanceText)).catch(DEFAULT_APPEARANCE.text),
  font: z
    .object({ sans: font_choice_schema, mono: font_choice_schema })
    .catch(DEFAULT_APPEARANCE.font),
});

// Additive like the wallpaper; each field falls back on its own, so one bad value doesn't reset the others.
export function parse_appearance(saved: unknown): Appearance {
  const result = appearance_schema.safeParse(typeof saved === "object" && saved !== null ? saved : {});
  return result.success ? result.data : { ...DEFAULT_APPEARANCE };
}

// Added after version 1 shipped: anything but a known answer means the question is still open.
export function parse_analytics(saved: unknown): AnalyticsConsent {
  return Object.values(AnalyticsConsent).find((answer) => answer === saved) ?? AnalyticsConsent.UNASKED;
}

export function serialize_settings(settings: PersistedSettings): string {
  return JSON.stringify(settings, null, 2);
}

/** Reads and removes the pre-`/etc` localStorage copy. */
export function take_legacy_settings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return null;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parse_settings(raw);
  } catch {
    return null;
  }
}

/** Reads and removes the v0 (React) settings: taskbar position, and the theme only if the user changed it. */
export function take_v0_settings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(V0_STORAGE_KEY);
    if (raw === null) return null;
    localStorage.removeItem(V0_STORAGE_KEY);

    const state = JSON.parse(raw)?.state;
    const theme = state?.theme ?? {};
    const customised = Object.entries(V0_DEFAULT_THEME).some(([token, value]) => theme[token] !== value);
    return parse_settings(
      JSON.stringify({ version: SETTINGS_VERSION, theme: customised ? theme : BRAND_DARK, taskbar: state?.taskbar })
    );
  } catch {
    return null;
  }
}
