export interface History<T> {
  readonly entries: readonly T[];
  readonly index: number;
}

export const MAX_ENTRIES = 100;

export function create_history<T>(initial: T): History<T> {
  return { entries: [initial], index: 0 };
}

export function current<T>(history: History<T>): T {
  return history.entries[history.index];
}

export function can_undo(history: History<unknown>): boolean {
  return history.index > 0;
}

export function can_redo(history: History<unknown>): boolean {
  return history.index < history.entries.length - 1;
}

export function push<T>(history: History<T>, entry: T, max_entries = MAX_ENTRIES): History<T> {
  const entries = [...history.entries.slice(0, history.index + 1), entry].slice(-Math.max(1, max_entries));
  return { entries, index: entries.length - 1 };
}

export function undo<T>(history: History<T>): History<T> {
  return can_undo(history) ? { entries: history.entries, index: history.index - 1 } : history;
}

export function redo<T>(history: History<T>): History<T> {
  return can_redo(history) ? { entries: history.entries, index: history.index + 1 } : history;
}
