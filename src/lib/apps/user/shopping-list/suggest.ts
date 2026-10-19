import { history_key, type History } from "./data";

/**
 * History entries matching what's typed: names that start with it first, then the most often bought, then the most
 * recent. `exclude` holds the history keys already open on the list.
 */
export function suggestions(history: History, query: string, exclude: ReadonlySet<string>, limit = 6): string[] {
  const typed = history_key(query);
  return Object.entries(history)
    .filter(([key]) => !exclude.has(key) && key !== typed && key.includes(typed))
    .sort(([a, x], [b, y]) => {
      const prefix = Number(b.startsWith(typed)) - Number(a.startsWith(typed));
      return prefix || y.count - x.count || y.last - x.last || a.localeCompare(b);
    })
    .slice(0, limit)
    .map(([key]) => key);
}

export function last_trip(history: History, exclude: ReadonlySet<string>): string[] {
  const entries = Object.entries(history).filter(([, entry]) => entry.count > 0);
  if (entries.length === 0) return [];
  const last = Math.max(...entries.map(([, entry]) => entry.last));
  return entries
    .filter(([key, entry]) => entry.last === last && !exclude.has(key))
    .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
    .map(([key]) => key);
}

/** One trip: every text counts once, all with the same `last`, which is how `last_trip` finds them again. */
export function record_trip(history: History, texts: readonly string[], now = Date.now()): History {
  const next = { ...history };
  for (const key of new Set(texts.map(history_key).filter(Boolean))) {
    next[key] = { count: (next[key]?.count ?? 0) + 1, last: now };
  }
  return next;
}
