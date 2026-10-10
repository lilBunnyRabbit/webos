import { TaskbarPosition, type FileDefaults, type Taskbar, type Theme, type ThemeToken } from "./type";
import { BRAND_DARK } from "./themes";

const STORAGE_KEY = "webos.settings";
export const SETTINGS_VERSION = 1;

export interface PersistedSettings {
  version: typeof SETTINGS_VERSION;
  theme: Theme;
  taskbar: Taskbar;
  file_defaults: FileDefaults;
}

// Merged over defaults so tokens added after the save still get a value.
export function load_settings(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

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
  const theme = { ...BRAND_DARK };
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

export function save_settings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}
