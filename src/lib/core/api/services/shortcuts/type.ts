import type { IService } from "../../type";
import type { WindowId } from "../windows/type";

/** Keyboard shortcuts (ADR-012, keys ADR-017): a registry and one `keydown` dispatcher. */
export interface ShortcutsService extends IService {
  /** Adds a shortcut and returns its disposer, made for `$effect`. Same keys in the same scope: the newer one wins. */
  register(shortcut: KeyShortcut): () => void;
  /** Every registered shortcut whose command exists, for the cheat sheet and the palette. */
  list(): ListedShortcut[];
  /**
   * Stops dispatching until the returned resume runs, so a key tester sees every key. Counted: nested suspends each
   * resume their own, and the dispatcher stays off until the last one does. Resume is idempotent.
   */
  suspend(): () => void;
  /** True while any `suspend()` is unresumed. */
  readonly suspended: boolean;
  /** Display: Cmd/Option symbols on macOS. */
  readonly mac: boolean;
}

interface ShortcutBase {
  /** Stable, dotted: `"window.close"`. */
  id: string;
  /** `"mod+shift+k"`: modifiers `mod` (Cmd on macOS, Ctrl elsewhere), `ctrl`, `alt`, `shift`, `meta`, then one key. */
  keys: string;
  category: ShortcutCategory;
}

/** An OS shortcut: runs a shell command line, and only while that command is available (ADR-033). */
export interface CommandShortcut extends ShortcutBase {
  command: string;
  /** Shown in the cheat sheet; the command's description when absent. */
  label?: string;
}

/** An app's own shortcut, until apps can register commands. */
export interface RunShortcut extends ShortcutBase {
  label: string;
  /** Live only while this window is focused, and ahead of global shortcuts. Absent: global. */
  window?: WindowId;
  run: () => void;
  /** Checked at key time; `false` lets the key fall through to the browser. */
  when?: () => boolean;
}

export type KeyShortcut = CommandShortcut | RunShortcut;

/** What `list()` hands out: labels resolved, scope readable without narrowing. */
export type ListedShortcut = KeyShortcut & { label: string; window?: WindowId };

export const ShortcutCategory = {
  WINDOW: "window",
  APPS: "apps",
  SYSTEM: "system",
  /** Registered by an app for its own window. */
  APP: "app",
} as const;
export type ShortcutCategory = (typeof ShortcutCategory)[keyof typeof ShortcutCategory];
