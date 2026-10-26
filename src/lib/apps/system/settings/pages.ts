import {
  AppWindow as AppWindowIcon,
  Archive as ArchiveIcon,
  Bell as BellIcon,
  CloudCheck as CloudCheckIcon,
  Image as ImageIcon,
  Info as InfoIcon,
  Keyboard as KeyboardIcon,
  MapTrifold as MapTrifoldIcon,
  Palette as PaletteIcon,
  Sparkle as SparkleIcon,
  SpeakerHigh as SpeakerHighIcon,
  SquareSplitVertical as SquareSplitVerticalIcon,
  TextAa as TextAaIcon,
} from "phosphor-svelte";
import { Platform } from "$lib/core/api/kernel/platform";
import type { IconComponent } from "$lib/core/components/ui";
import { Subpage, type Page } from "./ids";

export interface PageEntry {
  value: Page;
  label: string;
  icon: IconComponent;
  group: string;
  platform?: Platform;
}

export const PAGES: PageEntry[] = [
  { value: "theme", label: "Theme", icon: PaletteIcon, group: "Personalise" },
  { value: "wallpaper", label: "Wallpaper", icon: ImageIcon, group: "Personalise" },
  { value: "interface", label: "Text & interface", icon: TextAaIcon, group: "Personalise" },
  { value: "taskbar", label: "Taskbar", icon: SquareSplitVerticalIcon, group: "Personalise", platform: Platform.DESKTOP },
  { value: "notifications", label: "Notifications", icon: BellIcon, group: "System" },
  { value: "speech", label: "Speech", icon: SpeakerHighIcon, group: "System" },
  { value: "files", label: "Default apps", icon: AppWindowIcon, group: "System" },
  { value: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, group: "System" },
  { value: "backup", label: "Backup & reset", icon: ArchiveIcon, group: "System" },
  { value: "offline", label: "Offline", icon: CloudCheckIcon, group: "System" },
  { value: "whats-new", label: "What's new", icon: SparkleIcon, group: "WebOS" },
  { value: "roadmap", label: "Roadmap", icon: MapTrifoldIcon, group: "WebOS" },
  { value: "about", label: "About", icon: InfoIcon, group: "WebOS" },
];

export const SUBPAGE_LABELS: Record<Subpage, string> = {
  [Subpage.CREATE]: "Create a theme",
  [Subpage.COLOURS]: "Edit colours",
};

export const pages_for = (platform: Platform) => PAGES.filter((page) => !page.platform || page.platform === platform);

export type RelatedLink = { page: Page } | { app: string; label: string; props?: Record<string, string> };

export const RELATED: Partial<Record<Page, RelatedLink[]>> = {
  theme: [{ page: "wallpaper" }, { page: "interface" }],
  wallpaper: [{ page: "theme" }],
  interface: [{ page: "theme" }, { app: "font-maker", label: "Make a font in Font Maker" }, { app: "font-viewer", label: "Browse fonts in Font Viewer" }],
  taskbar: [{ page: "shortcuts" }],
  notifications: [{ app: "clock", label: "Alarms and timers in Clock" }],
  speech: [{ app: "ask", label: "Ask reads its answers aloud" }, { app: "terminal", label: "Say something in Terminal" }],
  files: [{ app: "file-explorer", label: "Open files in File Explorer" }],
  shortcuts: [{ page: "taskbar" }, { app: "terminal", label: "Run commands in Terminal" }],
  backup: [{ app: "activity-monitor", label: "Storage in Activity Monitor", props: { section: "storage" } }],
  offline: [{ app: "activity-monitor", label: "Downloads in Activity Monitor", props: { section: "tasks" } }, { page: "backup" }],
  "whats-new": [{ page: "roadmap" }],
  roadmap: [{ page: "whats-new" }],
  about: [{ page: "whats-new" }, { page: "roadmap" }, { app: "getting-started", label: "Getting started" }],
};
