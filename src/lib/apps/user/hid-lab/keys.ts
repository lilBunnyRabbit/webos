export interface KeyCap {
  /** `null` is a gap. */
  code: string | null;
  width: number;
}

export type KeyRow = KeyCap[];

export const Shape = { ANSI: "ansi", ISO: "iso" } as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

const key = (code: string | null, width = 1): KeyCap => ({ code, width });
const keys = (...codes: string[]) => codes.map((code) => key(code));
const letters = (text: string) => keys(...[...text].map((letter) => `Key${letter}`));

const FUNCTION_ROW: KeyRow = [
  key("Escape"),
  key(null),
  ...keys("F1", "F2", "F3", "F4"),
  key(null, 0.5),
  ...keys("F5", "F6", "F7", "F8"),
  key(null, 0.5),
  ...keys("F9", "F10", "F11", "F12"),
];
const NUMBER_ROW: KeyRow = [
  ...keys("Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"),
  key("Backspace", 2),
];
const BOTTOM_ROW: KeyRow = [
  key("ControlLeft", 1.25),
  key("MetaLeft", 1.25),
  key("AltLeft", 1.25),
  key("Space", 6.25),
  key("AltRight", 1.25),
  key("MetaRight", 1.25),
  key("ContextMenu", 1.25),
  key("ControlRight", 1.25),
];

/** Every row is 15 units wide. ISO's tall Enter is two caps with the same code. */
export const MAIN_BLOCK: Record<Shape, KeyRow[]> = {
  ansi: [
    FUNCTION_ROW,
    NUMBER_ROW,
    [key("Tab", 1.5), ...letters("QWERTYUIOP"), ...keys("BracketLeft", "BracketRight"), key("Backslash", 1.5)],
    [key("CapsLock", 1.75), ...letters("ASDFGHJKL"), ...keys("Semicolon", "Quote"), key("Enter", 2.25)],
    [key("ShiftLeft", 2.25), ...letters("ZXCVBNM"), ...keys("Comma", "Period", "Slash"), key("ShiftRight", 2.75)],
    BOTTOM_ROW,
  ],
  iso: [
    FUNCTION_ROW,
    NUMBER_ROW,
    [key("Tab", 1.5), ...letters("QWERTYUIOP"), ...keys("BracketLeft", "BracketRight"), key("Enter", 1.5)],
    [key("CapsLock", 1.75), ...letters("ASDFGHJKL"), ...keys("Semicolon", "Quote", "Backslash"), key("Enter", 1.25)],
    [key("ShiftLeft", 1.25), key("IntlBackslash"), ...letters("ZXCVBNM"), ...keys("Comma", "Period", "Slash"), key("ShiftRight", 2.75)],
    BOTTOM_ROW,
  ],
};

export const NAV_BLOCK: KeyRow[] = [
  keys("PrintScreen", "ScrollLock", "Pause"),
  keys("Insert", "Home", "PageUp"),
  keys("Delete", "End", "PageDown"),
  [key(null, 3)],
  [key(null), key("ArrowUp"), key(null)],
  keys("ArrowLeft", "ArrowDown", "ArrowRight"),
];

export const NUMPAD_BLOCK: KeyRow[] = [
  [key(null, 4)],
  keys("NumLock", "NumpadDivide", "NumpadMultiply", "NumpadSubtract"),
  keys("Numpad7", "Numpad8", "Numpad9", "NumpadAdd"),
  keys("Numpad4", "Numpad5", "Numpad6", "NumpadAdd"),
  keys("Numpad1", "Numpad2", "Numpad3", "NumpadEnter"),
  [key("Numpad0", 2), key("NumpadDecimal"), key("NumpadEnter")],
];

export function block_codes(rows: KeyRow[]): Set<string> {
  return new Set(rows.flat().flatMap((cap) => (cap.code ? [cap.code] : [])));
}

export const NAV_CODES = block_codes(NAV_BLOCK);
export const NUMPAD_CODES = block_codes(NUMPAD_BLOCK);

const LABELS: Record<string, string> = {
  Escape: "Esc",
  Backspace: "⌫",
  Tab: "Tab",
  CapsLock: "Caps",
  Enter: "Enter",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  MetaLeft: "Win",
  MetaRight: "Win",
  ContextMenu: "Menu",
  Space: "",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  Pause: "Pause",
  Insert: "Ins",
  Home: "Home",
  PageUp: "PgUp",
  Delete: "Del",
  End: "End",
  PageDown: "PgDn",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  NumLock: "Num",
  NumpadDivide: "/",
  NumpadMultiply: "*",
  NumpadSubtract: "−",
  NumpadAdd: "+",
  NumpadEnter: "Ent",
  NumpadDecimal: ".",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "<",
};

const MAC_LABELS: Record<string, string> = {
  MetaLeft: "⌘",
  MetaRight: "⌘",
  AltLeft: "⌥",
  AltRight: "⌥",
  ControlLeft: "⌃",
  ControlRight: "⌃",
};

/**
 * `layout` is `navigator.keyboard.getLayoutMap()`: what the user's layout prints on a writing key (`KeyZ` is "y" on a
 * German layout). Keys it doesn't cover keep their US label.
 */
export function cap_label(code: string, layout: ReadonlyMap<string, string> | null, mac: boolean): string {
  if (mac && MAC_LABELS[code]) return MAC_LABELS[code];
  const printed = layout?.get(code);
  if (printed && printed.trim()) return printed.toUpperCase();
  if (code in LABELS) return LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return code.slice(6);
  return code;
}

export const KeyLocation = { STANDARD: 0, LEFT: 1, RIGHT: 2, NUMPAD: 3 } as const;
export type KeyLocation = (typeof KeyLocation)[keyof typeof KeyLocation];

export function location_name(location: number): string {
  return ["Standard", "Left", "Right", "Numpad"][location] ?? String(location);
}

export interface Modifiers {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function modifier_names(event: Modifiers, mac: boolean): string[] {
  const names: string[] = [];
  if (event.ctrlKey) names.push("Ctrl");
  if (event.altKey) names.push(mac ? "Option" : "Alt");
  if (event.shiftKey) names.push("Shift");
  if (event.metaKey) names.push(mac ? "Cmd" : "Meta");
  return names;
}

export function key_text(key: string): string {
  if (key === " ") return "Space";
  if (key === "") return "(empty)";
  return key;
}

export function heat(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count < 5) return 2;
  if (count < 15) return 3;
  return 4;
}

interface KeyboardApi {
  getLayoutMap(): Promise<ReadonlyMap<string, string>>;
}

/** Chromium only, and not inside cross-origin iframes; `null` keeps the US labels. */
export async function layout_map(): Promise<ReadonlyMap<string, string> | null> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
  return (await keyboard?.getLayoutMap().catch(() => null)) ?? null;
}
