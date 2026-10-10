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
}

export interface StorageHandle {
  get<T>(key: string, schema?: ZodType<T>): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Must be called during component init: it uses `$effect` to save. */
  persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
}
