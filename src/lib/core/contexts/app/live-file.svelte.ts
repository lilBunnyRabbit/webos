import { ShellError } from "$lib/core/api/services/shell/type";
import type { ZodType } from "zod";
import { json_file, type JsonFile } from "./json-file.svelte";

// Held a while after use: the save runs in an effect, and a cell dropped at once could let the next command read the
// file before that write lands.
export const LINGER_MS = 3000;

function when_ready(cell: JsonFile<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const stop = $effect.root(() => {
      $effect(() => {
        if (!cell.ready) return;
        resolve();
        queueMicrotask(() => stop());
      });
    });
  });
}

export interface LiveFile<T> {
  read(): Promise<T>;
  edit(change: (value: T) => T): Promise<T>;
}

/** For shell commands: goes through the same shared cell an open window holds, so a change shows there at once. */
export function live_file<T>(path: string, initial: T, schema: ZodType<T>): LiveFile<T> {
  async function use<R>(fn: (cell: JsonFile<T>) => R): Promise<R> {
    const cell = json_file(path, initial, schema);
    try {
      await when_ready(cell);
      if (cell.error) throw new ShellError(`${path} isn't valid; it was left as it is`);
      return fn(cell);
    } finally {
      setTimeout(() => cell.release(), LINGER_MS);
    }
  }
  return {
    read: () => use((cell) => $state.snapshot(cell.value) as T),
    edit: (change) =>
      use((cell) => {
        const next = change($state.snapshot(cell.value) as T);
        cell.value = next;
        return next;
      }),
  };
}
