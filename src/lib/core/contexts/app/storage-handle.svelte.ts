import type { AppId } from "$lib/core/api";
import type { ZodType } from "zod";
import type { StorageHandle } from "./type";

// One cell per key across all windows of an app, so they share the value live instead of overwriting each other on save.
const cells = new Map<string, PersistedCell<unknown>>();

class PersistedCell<T> {
  value = $state() as T;
  #refs = 0;
  #dispose: () => void;

  constructor(initial: T, save: (value: T) => void) {
    this.value = initial;
    this.#dispose = $effect.root(() => {
      $effect(() => save($state.snapshot(this.value) as T));
    });
  }

  retain(): void {
    this.#refs++;
  }

  /** Returns true when the last user is gone and the cell is disposed. */
  release(): boolean {
    if (--this.#refs > 0) return false;
    this.#dispose();
    return true;
  }
}

export function create_storage_handle(app_id: AppId): StorageHandle {
  const prefix = `app.${app_id}.`;

  function get<T>(key: string, schema?: ZodType<T>): T | null {
    try {
      const raw = localStorage.getItem(prefix + key);
      if (raw === null) return null;

      const data: unknown = JSON.parse(raw);
      if (!schema) return data as T;

      const result = schema.safeParse(data);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  function set<T>(key: string, value: T): void {
    const cell = cells.get(prefix + key);
    if (cell) cell.value = value;
    else write(key, value);
  }

  function write<T>(key: string, value: T): void {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to save ${prefix + key}:`, error);
    }
  }

  function remove(key: string): void {
    localStorage.removeItem(prefix + key);
  }

  function persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T } {
    const full_key = prefix + key;

    let cell = cells.get(full_key) as PersistedCell<T> | undefined;
    if (!cell) {
      cell = new PersistedCell(get(key, schema) ?? initial, (value) => write(key, value));
      cells.set(full_key, cell);
    }

    cell.retain();
    const owned = cell;
    $effect(() => () => {
      if (owned.release()) cells.delete(full_key);
    });

    return cell;
  }

  return { get, set, remove, persisted };
}
