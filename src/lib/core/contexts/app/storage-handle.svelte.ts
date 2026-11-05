import type { AppId } from "$lib/core/api";
import type { ZodType } from "zod";
import { app_data_path, json_file } from "./json-file.svelte";
import type { StorageHandle } from "./type";

export function create_storage_handle(app_id: AppId, window_state: Record<string, unknown>): StorageHandle {
  function window_cell<T>(key: string, initial: T, schema?: ZodType<T>): { value: T } {
    const parsed = key in window_state && schema ? schema.safeParse(window_state[key]) : null;
    if (!(key in window_state) || parsed?.success === false) window_state[key] = initial;
    else if (parsed?.success) window_state[key] = parsed.data;

    return {
      get value() {
        return window_state[key] as T;
      },
      set value(value: T) {
        window_state[key] = value;
      },
    };
  }

  function file<T>(name: string, initial: T, schema: ZodType<T>) {
    const handle = json_file(app_data_path(app_id, name), initial, schema);
    $effect(() => () => handle.release());
    return handle;
  }

  return { window: window_cell, file };
}
