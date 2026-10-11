import { TaskbarPosition, type FileDefaults, type Taskbar, type Theme, type ThemeToken } from "./type";
import { BRAND_DARK, BRAND_LIGHT, derive_surfaces } from "./themes";
import { PATHS } from "../files/hierarchy";

/** OS config lives in system storage (ADR-021). */
export const SETTINGS_PATH = `${PATHS.etc}/settings.json`;

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
      taskbar: { position },
      file_defaults: sanitize_file_defaults(data.file_defaults),
    };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return null;
  }
}

function merge_theme(saved: unknown): Theme {
  const source = (saved ?? {}) as Partial<Record<ThemeToken, unknown>>;
  // Tokens a save predates come from the matching brand palette, or are derived from its own background.
  const brand = [BRAND_DARK, BRAND_LIGHT].find((palette) => palette.background === source.background);
  const theme = { ...BRAND_DARK, ...(brand ?? derive_surfaces()) };
  for (const token of Object.keys(theme) as ThemeToken[]) {
    const value = source[token];
    if (typeof value === "string") theme[token] = value;
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
