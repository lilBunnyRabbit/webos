/**
 * Key combinations as strings: `"mod+shift+k"`. Mod is Cmd on macOS and Ctrl elsewhere (ADR-012). Keys are matched by
 * `KeyboardEvent.code`, so the keyboard layout and Option-modified characters on macOS don't change what matches.
 */

const MODIFIERS = ["mod", "ctrl", "alt", "shift", "meta"] as const;
type Modifier = (typeof MODIFIERS)[number];

const CODE_KEYS: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Backquote: "`",
  Slash: "/",
  Comma: ",",
  Period: ".",
  Escape: "esc",
  Enter: "enter",
  Space: "space",
  Backspace: "backspace",
  Delete: "delete",
  Tab: "tab",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};

/** `KeyboardEvent.code` → key token, or `null` for keys shortcuts don't use (modifiers alone, media keys). */
export function code_key(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return CODE_KEYS[code] ?? null;
}

/** Canonical form: modifiers in a fixed order, then the key. `"Shift+Mod+K"` → `"mod+shift+k"`. */
export function normalize(keys: string): string {
  const parts = keys.toLowerCase().split("+").map((part) => part.trim());
  // "+" itself would split to empty parts; no shortcut uses it.
  const key = parts.filter((part) => !MODIFIERS.includes(part as Modifier)).at(-1) ?? "";
  const modifiers = MODIFIERS.filter((modifier) => parts.includes(modifier));
  return [...modifiers, key].join("+");
}

export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** The canonical combination an event produced, or `null` when it's only a modifier. */
export function event_keys(event: KeyEventLike, mac: boolean): string | null {
  const key = code_key(event.code);
  if (!key) return null;
  const modifiers: Modifier[] = [];
  if (mac ? event.metaKey : event.ctrlKey) modifiers.push("mod");
  if (mac && event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");
  if (!mac && event.metaKey) modifiers.push("meta");
  return normalize([...modifiers, key].join("+"));
}

/** Whether the combination has a modifier that typing never produces alone (so it may fire inside a text field). */
export function has_command_modifier(keys: string): boolean {
  return normalize(keys).split("+").some((part) => part === "mod" || part === "ctrl" || part === "alt" || part === "meta");
}

const MAC_LABELS: Record<string, string> = { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" };
const PC_LABELS: Record<string, string> = { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
const KEY_LABELS: Record<string, string> = { up: "↑", down: "↓", left: "←", right: "→", esc: "Esc", enter: "↵", space: "Space" };

/** Display parts for `<Kbd>` chips: `"mod+shift+k"` → `["⌘", "⇧", "K"]` on macOS, `["Ctrl", "Shift", "K"]` elsewhere. */
export function format_keys(keys: string, mac: boolean): string[] {
  const labels = mac ? MAC_LABELS : PC_LABELS;
  return normalize(keys)
    .split("+")
    .map((part) => labels[part] ?? KEY_LABELS[part] ?? part.toUpperCase());
}

export function is_mac(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
  return /mac|ios|iphone|ipad/i.test(data?.platform ?? navigator.platform);
}
