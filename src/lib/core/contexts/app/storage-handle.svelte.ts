import type { AppId } from "$lib/core/api";
import type { ZodType } from "zod";
import type { StorageHandle } from "./type";

// One cell per key across all windows of an app, so they share the value live instead of overwriting each other on save.
const cells = new Map<string, PersistedCell<unknown>>();

class PersistedCell<T> {
  value = $state() as T;
  #refs = 0;
  #skip_save = false;
  #dispose: () => void;

  readonly #initial: T;

  constructor(initial: T, stored: T | null, save: (value: T) => void) {
    // Values are JSON-persisted, so structuredClone is safe; the copy keeps edits to the live value out of the reset target.
    this.#initial = structuredClone(initial);
    this.value = stored ?? initial;
    this.#dispose = $effect.root(() => {
      $effect(() => {
        const snapshot = $state.snapshot(this.value) as T;
        if (this.#skip_save) {
          this.#skip_save = false;
          return;
        }
        save(snapshot);
      });
    });
  }

  /** Back to the initial value without writing it, so the key stays removed until the next change. */
  reset(): void {
    // Assigning an equal primitive doesn't re-run the save effect, so the skip flag would leak into the next real change.
    if (Object.is(this.value, this.#initial)) return;
    this.#skip_save = true;
    this.value = structuredClone(this.#initial);
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

export function create_storage_handle(app_id: AppId, window_state: Record<string, unknown>): StorageHandle {
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
    try {
      localStorage.removeItem(prefix + key);
    } catch (error) {
      console.error(`Failed to remove ${prefix + key}:`, error);
    }
    cells.get(prefix + key)?.reset();
  }

  function persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T } {
    const full_key = prefix + key;

    let cell = cells.get(full_key) as PersistedCell<T> | undefined;
    if (!cell) {
      cell = new PersistedCell(initial, get(key, schema), (value) => write(key, value));
      cells.set(full_key, cell);
    }

    cell.retain();
    const owned = cell;
    $effect(() => () => {
      if (owned.release()) cells.delete(full_key);
    });

    return cell;
  }

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

  return { get, set, remove, persisted, window: window_cell };
}
