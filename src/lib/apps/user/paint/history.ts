// Immutable so a `$state.raw` holding it is all the reactivity the app needs.
export interface History<T> {
  readonly entries: readonly T[];
  readonly index: number;
}

export interface HistoryLimits<T> {
  max_entries: number;
  max_bytes?: number;
  size_of?: (entry: T) => number;
}

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

export function push<T>(history: History<T>, entry: T, limits: HistoryLimits<T>): History<T> {
  const entries = [...history.entries.slice(0, history.index + 1), entry];
  let drop = Math.max(0, entries.length - Math.max(1, limits.max_entries));

  const size_of = limits.size_of;
  if (limits.max_bytes !== undefined && size_of) {
    let total = 0;
    for (let i = drop; i < entries.length; i++) total += size_of(entries[i]);
    while (drop < entries.length - 1 && total > limits.max_bytes) {
      total -= size_of(entries[drop]);
      drop++;
    }
  }

  const kept = entries.slice(drop);
  return { entries: kept, index: kept.length - 1 };
}

export function undo<T>(history: History<T>): History<T> {
  return can_undo(history) ? { entries: history.entries, index: history.index - 1 } : history;
}

export function redo<T>(history: History<T>): History<T> {
  return can_redo(history) ? { entries: history.entries, index: history.index + 1 } : history;
}
