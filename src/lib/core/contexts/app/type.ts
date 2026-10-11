import type { ConfirmOptions } from "$lib/core/components/dialogs/confirm-dialog.svelte";
import type { PromptOptions } from "$lib/core/components/dialogs/prompt-dialog.svelte";
import type { PickOptions, SaveOptions } from "$lib/core/components/files/file-picker-dialog.svelte";
import type { AppId, WindowId } from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import type { ZodType } from "zod";

export interface AppContext {
  window_id: WindowId;
  app_id: AppId;
  window: WindowHandle;
  storage: StorageHandle;
}

export interface WindowHandle {
  readonly id: WindowId;
  readonly is_focused: boolean;
  readonly is_maximized: boolean;
  readonly is_minimized: boolean;
  readonly bounds: Readonly<Bounds>;

  focus(): void;
  close(): void;
  minimize(): void;
  maximize(): void;
  restore(): void;

  /** A confirm sheet over this window (ADR-025). Resolves `false` on Cancel or if the window closes. */
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  /** A text prompt sheet over this window. Resolves `null` on Cancel, Esc or if the window closes. */
  prompt(message: string, options?: PromptOptions): Promise<string | null>;
  /** A file picker sheet (File Explorer in picker mode) over this window. Resolves the chosen path, or `null`. */
  pick_file(options?: PickOptions & { title?: string }): Promise<string | null>;
  /** The same picker for folders. */
  pick_directory(options?: Omit<PickOptions, "accept"> & { title?: string }): Promise<string | null>;
  /** The picker in save mode: a folder plus a file name. Resolves the full path, or `null`. Writing is the caller's job. */
  pick_save(options?: SaveOptions & { title?: string }): Promise<string | null>;
}

export interface StorageHandle {
  get<T>(key: string, schema?: ZodType<T>): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Must be called during component init: it uses `$effect` to save. */
  persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
}

export type { ConfirmOptions, PickOptions, PromptOptions, SaveOptions };
