import { ShortcutCategory, type CommandShortcut } from "./type";

/**
 * The OS shortcuts (ADR-017 revision): key bindings only, the actions are shell commands (ADR-033). A command the
 * platform doesn't have (`win snap` on mobile) leaves its key to the browser.
 */
export const DEFAULT_SHORTCUTS: CommandShortcut[] = [
  { id: "window.close", keys: "alt+shift+w", category: ShortcutCategory.WINDOW, command: "win close", label: "Close window" },
  { id: "window.minimize", keys: "alt+shift+down", category: ShortcutCategory.WINDOW, command: "win minimize" },
  { id: "window.maximize", keys: "alt+shift+up", category: ShortcutCategory.WINDOW, command: "win maximize", label: "Maximize or restore window" },
  { id: "window.snap_left", keys: "alt+shift+left", category: ShortcutCategory.WINDOW, command: "win snap left", label: "Snap window left" },
  { id: "window.snap_right", keys: "alt+shift+right", category: ShortcutCategory.WINDOW, command: "win snap right", label: "Snap window right" },
  { id: "window.gather", keys: "alt+shift+g", category: ShortcutCategory.WINDOW, command: "win gather" },
  { id: "window.previous", keys: "alt+`", category: ShortcutCategory.WINDOW, command: "win previous" },
  { id: "window.cycle", keys: "alt+shift+`", category: ShortcutCategory.WINDOW, command: "win cycle" },
  { id: "window.reopen", keys: "alt+shift+t", category: ShortcutCategory.WINDOW, command: "win reopen" },
  { id: "desktop.show", keys: "alt+shift+d", category: ShortcutCategory.WINDOW, command: "win desktop" },
  { id: "apps.launcher", keys: "mod+k", category: ShortcutCategory.APPS, command: "ui launcher", label: "Search apps and commands" },
  { id: "apps.terminal", keys: "alt+shift+enter", category: ShortcutCategory.APPS, command: "app launch terminal", label: "Open Terminal" },
  { id: "apps.settings", keys: "mod+,", category: ShortcutCategory.APPS, command: "app launch settings", label: "Open Settings" },
  { id: "system.notifications", keys: "alt+shift+n", category: ShortcutCategory.SYSTEM, command: "ui notifications", label: "Notifications" },
  { id: "system.shortcuts", keys: "mod+/", category: ShortcutCategory.SYSTEM, command: "shortcuts sheet", label: "Keyboard shortcuts" },
];
