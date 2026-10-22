import { Platform } from "$lib/core/api/kernel/platform";
import { search_ranked } from "$lib/core/utils/search";
import type { Completion } from "$lib/core/api/services/shell/type";
import { PAGE_IDS, Subpage, type Page } from "./ids";
import { PAGES, SUBPAGE_LABELS } from "./pages";

/**
 * One thing search can land on. A page's own entry has its page's id; every other id is the `setting` anchor of a
 * `Section` or `SettingRow` on `page` (or on its `sub`page, whose root carries the id). `settings.browser.test.ts`
 * fails when an id has no anchor.
 */
export interface SettingEntry {
  id: string;
  page: Page;
  label: string;
  keywords: string[];
  sub?: Subpage;
  platform?: Platform;
}

const page_entry = (page: Page, keywords: string[]): SettingEntry => {
  const entry = PAGES.find((item) => item.value === page)!;
  return { id: page, page, label: entry.label, keywords, platform: entry.platform };
};

export const SETTINGS: SettingEntry[] = [
  page_entry("theme", ["appearance", "colors", "dark mode", "light mode", "look"]),
  { id: "saved-themes", page: "theme", label: "Your themes", keywords: ["import", "export", "rename", "delete", "webos-theme", "saved"] },
  { id: "theme-presets", page: "theme", label: "Themes", keywords: ["brand dark", "brand light", "presets", "dark mode", "light mode"] },
  { id: "project-themes", page: "theme", label: "Project themes", keywords: ["speed reader", "while true"] },
  { id: "theme-create", page: "theme", sub: Subpage.CREATE, label: "Create a theme", keywords: ["generate", "random", "harmony", "vibrance", "contrast", "new theme"] },
  { id: "theme-colours", page: "theme", sub: Subpage.COLOURS, label: "Edit colours", keywords: ["customise", "customize", "colors", "tokens", "oklch", "primary", "accent", "background"] },

  page_entry("wallpaper", ["background", "desktop", "home screen"]),
  { id: "wallpaper-style", page: "wallpaper", label: "Wallpaper style", keywords: ["grid", "glow", "tint", "plain", "background"] },
  { id: "wallpaper-image", page: "wallpaper", label: "Wallpaper image", keywords: ["picture", "photo", "fit", "fill", "tile", "dim", "blur"] },
  { id: "live-wallpapers", page: "wallpaper", label: "Live wallpapers", keywords: ["animated", "pew pew", "moving"], platform: Platform.DESKTOP },

  page_entry("interface", ["appearance", "accessibility", "readability"]),
  { id: "text-size", page: "interface", label: "Text size", keywords: ["font size", "zoom", "bigger", "smaller", "scale"] },
  { id: "motion", page: "interface", label: "Motion", keywords: ["animations", "reduce motion", "accessibility"] },
  { id: "ui-font", page: "interface", label: "UI font", keywords: ["typeface", "inter", "burrow", "font file"] },
  { id: "code-font", page: "interface", label: "Code font", keywords: ["monospace", "typeface", "hack", "terminal font"] },
  { id: "corners", page: "interface", label: "Corners", keywords: ["radius", "rounded", "sharp", "round"] },
  { id: "shadows", page: "interface", label: "Shadows", keywords: ["elevation", "depth", "flat"] },

  page_entry("taskbar", ["dock", "panel", "bar"]),
  { id: "taskbar-position", page: "taskbar", label: "Taskbar position", keywords: ["dock", "top", "bottom", "left", "right", "edge"], platform: Platform.DESKTOP },
  { id: "taskbar-size", page: "taskbar", label: "Taskbar size", keywords: ["small", "large", "icons"], platform: Platform.DESKTOP },
  { id: "taskbar-auto-hide", page: "taskbar", label: "Auto-hide taskbar", keywords: ["hide", "fullscreen"], platform: Platform.DESKTOP },
  { id: "taskbar-seconds", page: "taskbar", label: "Show seconds", keywords: ["clock", "time"], platform: Platform.DESKTOP },

  page_entry("notifications", ["alerts", "alarms", "reminders"]),
  { id: "notification-permission", page: "notifications", label: "System notifications", keywords: ["permission", "allow", "blocked", "alerts"] },
  { id: "notification-test", page: "notifications", label: "Send a test notification", keywords: ["try", "test"] },
  { id: "notification-closed", page: "notifications", label: "Alerts with every tab closed", keywords: ["background", "triggers", "closed"] },

  page_entry("files", ["file types", "associations"]),
  { id: "default-apps", page: "files", label: "Remembered choices", keywords: ["open with", "always use", "forget", "file types"] },

  page_entry("shortcuts", ["keyboard", "hotkeys", "keys", "key bindings"]),
  { id: "shortcuts-windows", page: "shortcuts", label: "Window shortcuts", keywords: ["snap", "close", "minimize"] },
  { id: "shortcuts-apps", page: "shortcuts", label: "App shortcuts", keywords: ["launcher", "search", "terminal", "palette"] },
  { id: "shortcuts-system", page: "shortcuts", label: "System shortcuts", keywords: ["desktop", "lock"] },

  page_entry("backup", ["export", "import", "save", "reset"]),
  { id: "backup-create", page: "backup", label: "Back up", keywords: ["download", "zip", "export", "save"] },
  { id: "backup-restore", page: "backup", label: "Restore from a backup", keywords: ["import", "zip", "recover"] },
  { id: "reset-settings", page: "backup", label: "Reset settings", keywords: ["defaults", "factory", "start over"] },

  page_entry("offline", ["no internet", "connection", "download", "cache", "airplane"]),
  { id: "offline-apps", page: "offline", label: "Apps kept offline", keywords: ["keep offline", "download", "saved", "no internet"] },

  page_entry("whats-new", ["changelog", "release notes", "updates", "version history"]),
  page_entry("roadmap", ["plans", "next", "todo", "progress"]),

  page_entry("about", ["version", "info"]),
  { id: "install", page: "about", label: "Install WebOS", keywords: ["pwa", "app", "offline", "home screen"] },
  { id: "build", page: "about", label: "Build", keywords: ["version", "commit", "branch"] },
  { id: "updates", page: "about", label: "Check for updates", keywords: ["update", "reload", "new version"] },
  { id: "pipeline", page: "about", label: "Pipeline", keywords: ["ci", "build status", "actions", "deploy", "github"] },
  { id: "introduction", page: "about", label: "Introduction", keywords: ["tour", "getting started", "welcome", "help"] },
  { id: "feedback", page: "about", label: "Feedback", keywords: ["bug", "issue", "feature request", "propose an app", "github"] },
  { id: "credits", page: "about", label: "Credits", keywords: ["authors", "who made"] },
];

export const is_page = (entry: SettingEntry) => (PAGE_IDS as readonly string[]).includes(entry.id);

export function place_of(entry: SettingEntry): string {
  const page = PAGES.find((item) => item.value === entry.page)!.label;
  if (is_page(entry)) return "Page";
  return entry.sub ? `${page} › ${SUBPAGE_LABELS[entry.sub]}` : page;
}

export const settings_for = (platform: Platform) => SETTINGS.filter((entry) => !entry.platform || entry.platform === platform);

export const find_setting = (id: string, platform: Platform) => settings_for(platform).find((entry) => entry.id === id);

const index_of = new Map(SETTINGS.map((entry, index) => [entry, index]));

export function search_settings(query: string, platform: Platform): SettingEntry[] {
  return search_ranked(
    settings_for(platform),
    query,
    (entry) => ({ name: entry.label, keywords: entry.keywords, other: [place_of(entry), entry.id] }),
    (a, b) => index_of.get(a)! - index_of.get(b)!
  );
}

export function complete_setting(partial: string, platform: Platform): Completion[] {
  const needle = partial.toLowerCase();
  const prefixed = settings_for(platform).filter((entry) => entry.id.startsWith(needle));
  const found = prefixed.length > 0 || needle === "" ? prefixed : search_settings(needle, platform);
  return found.map((entry) => ({ value: entry.id, detail: is_page(entry) ? entry.label : `${entry.label} · ${place_of(entry)}` }));
}
