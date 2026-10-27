import type { ConfirmOptions } from "$lib/core/components/dialogs/confirm-dialog.svelte";
import type { PromptOptions } from "$lib/core/components/dialogs/prompt-dialog.svelte";
import type { PickOptions, SaveOptions } from "$lib/core/components/files/file-picker-dialog.svelte";
import type { AppId, DirtyOptions, WindowId } from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import type { ZodType } from "zod";
import type { JsonFile } from "./json-file.svelte";

export interface AppContext {
  window_id: WindowId;
  app_id: AppId;
  window: WindowHandle;
  storage: StorageHandle;
  /** Reports the achievements the manifest declares (ADR-078), bound to this app. */
  achievements: AchievementsHandle;
}

export interface WindowHandle {
  readonly id: WindowId;
  readonly is_focused: boolean;
  readonly is_maximized: boolean;
  readonly is_minimized: boolean;
  /** Not minimized (mobile: on screen) and the tab isn't hidden. Pause loops and timers on false (ADR-035). */
  readonly is_visible: boolean;
  readonly bounds: Readonly<Bounds>;

  focus(): void;
  /** Asks first when the window has unsaved changes (ADR-029). An app that just saved calls `set_dirty(false)` first. */
  close(): void;
  /** Shows a document title instead of the app name (titlebar, taskbar tooltip, switcher). `null` restores it. */
  set_title(title: string | null): void;
  /**
   * Marks unsaved changes: closing asks Save / Don't save / Cancel (Save only with `save`), the titlebar shows a dot and
   * the page warns before unloading. `$effect(() => window.set_dirty(dirty, { save }))`.
   */
  set_dirty(dirty: boolean, options?: DirtyOptions): void;
  minimize(): void;
  maximize(): void;
  restore(): void;
  /**
   * Claims the mobile Back button for this window's own navigation (ADR-003 revision). `handler` returns `true` when it
   * handled back. Returns the disposer, so `$effect(() => window.on_back(...))` just works. Desktop never calls it.
   */
  on_back(handler: () => boolean): () => void;

  /** A confirm sheet over this window (ADR-025). Resolves `false` on Cancel or if the window closes. */
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  /** A text prompt sheet over this window. Resolves `null` on Cancel, Esc or if the window closes. */
  prompt(message: string, options?: PromptOptions): Promise<string | null>;
  /**
   * A file picker sheet (File Explorer in picker mode) over this window. Resolves the chosen path, or `null`. With
   * `multiple: true` it takes several files from one folder (and several from "This device…") and resolves their paths,
   * `[]` on Cancel.
   */
  pick_file(options: PickOptions & { title?: string; multiple: true }): Promise<string[]>;
  pick_file(options?: PickOptions & { title?: string; multiple?: false }): Promise<string | null>;
  /** The same picker for folders. */
  pick_directory(options?: Omit<PickOptions, "accept"> & { title?: string }): Promise<string | null>;
  /** The picker in save mode: a folder plus a file name. Resolves the full path, or `null`. Writing is the caller's job. */
  pick_save(options?: SaveOptions & { title?: string }): Promise<string | null>;
}

export interface AchievementsHandle {
  /** Unlocks it; the OS toasts the first time. An id the manifest doesn't declare warns and does nothing. */
  achieve(id: string): void;
  /** The running total toward its `goal` (say, games won so far); the highest seen counts, and reaching the goal unlocks it. */
  progress(id: string, n: number): void;
}

export interface StorageHandle {
  get<T>(key: string, schema?: ZodType<T>): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Must be called during component init: it uses `$effect` to save. */
  persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
  /**
   * State of this window only, such as the open tab. Starts at `initial` in a new window; a restored window gets its
   * saved value back when it still passes `schema`. Saved with the session, gone when the window closes.
   */
  window<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
  /**
   * A JSON file in the app's data folder, `/var/lib/apps/{app_id}/{name}` (ADR-035), shared by every window of the app
   * and reloaded when it changes on disk. Must be called during component init: it releases on unmount.
   */
  file<T>(name: string, initial: T, schema: ZodType<T>): Omit<JsonFile<T>, "release">;
}

export type { ConfirmOptions, PickOptions, PromptOptions, SaveOptions };
