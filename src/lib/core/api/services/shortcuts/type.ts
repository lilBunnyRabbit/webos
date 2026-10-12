import type { IService } from "../../type";
import type { WindowId } from "../windows/type";

/** Keyboard shortcuts (ADR-012, keys ADR-017): a registry and one `keydown` dispatcher. */
export interface ShortcutsService extends IService {
  /** Adds a shortcut and returns its disposer, made for `$effect`. Same keys in the same scope: the newer one wins. */
  register(shortcut: KeyShortcut): () => void;
  /** Every registered shortcut, for the cheat sheet. */
  list(): KeyShortcut[];
  /** Display: Cmd/Option symbols on macOS. */
  readonly mac: boolean;
}

export interface KeyShortcut {
  /** Stable, dotted: `"window.close"`. */
  id: string;
  /** `"mod+shift+k"`: modifiers `mod` (Cmd on macOS, Ctrl elsewhere), `ctrl`, `alt`, `shift`, `meta`, then one key. */
  keys: string;
  label: string;
  category: ShortcutCategory;
  /** Live only while this window is focused, and ahead of global shortcuts. Absent: global. */
  window?: WindowId;
  run: () => void;
  /** Checked at key time; `false` lets the key fall through to the browser. */
  when?: () => boolean;
}

export const ShortcutCategory = {
  WINDOW: "window",
  APPS: "apps",
  SYSTEM: "system",
  /** Registered by an app for its own window. */
  APP: "app",
} as const;
export type ShortcutCategory = (typeof ShortcutCategory)[keyof typeof ShortcutCategory];
