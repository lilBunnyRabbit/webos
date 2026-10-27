import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "./type";

export const USAGE_PATH = `${PATHS.var_lib}/apps/usage.json`;
const USAGE_VERSION = 1;

export interface AppUsage {
  seconds: number;
  last: string;
  days: number;
}

export type Usage = Record<AppId, AppUsage>;

const usage_schema = z.object({
  version: z.literal(USAGE_VERSION),
  apps: z.record(
    z.string(),
    z.object({ seconds: z.number().nonnegative(), last: z.string(), days: z.number().int().nonnegative().optional() })
  ),
});

export function parse_usage(text: string | null): Usage {
  if (text === null) return {};
  try {
    const result = usage_schema.safeParse(JSON.parse(text));
    if (!result.success) return {};
    return Object.fromEntries(
      Object.entries(result.data.apps).map(([id, entry]) => [id, { seconds: entry.seconds, last: entry.last, days: Math.max(1, entry.days ?? 1) }])
    );
  } catch {
    return {};
  }
}

export function serialize_usage(usage: Usage): string {
  const apps = Object.fromEntries(Object.entries(usage).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ version: USAGE_VERSION, apps }) + "\n";
}

function local_day(time: Date): string {
  return `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()}`;
}

export function add_time(usage: Usage, id: AppId, seconds: number, now: Date): Usage {
  if (seconds <= 0) return usage;
  const before = usage[id];
  const new_day = !before || local_day(new Date(before.last)) !== local_day(now);
  return {
    ...usage,
    [id]: {
      seconds: Math.round(((before?.seconds ?? 0) + seconds) * 10) / 10,
      last: now.toISOString(),
      days: (before?.days ?? 0) + (new_day ? 1 : 0),
    },
  };
}

/** Time a tab counted since its last write, per app: added onto what the file holds then, so tabs don't overwrite each other. */
export interface UsageDelta {
  seconds: number;
  last: string;
}

export function add_delta(deltas: Record<AppId, UsageDelta>, id: AppId, seconds: number, now: Date): Record<AppId, UsageDelta> {
  if (seconds <= 0) return deltas;
  return { ...deltas, [id]: { seconds: (deltas[id]?.seconds ?? 0) + seconds, last: now.toISOString() } };
}

export function merge_usage(usage: Usage, deltas: Record<AppId, UsageDelta>): Usage {
  let merged = usage;
  for (const [id, delta] of Object.entries(deltas)) merged = add_time(merged, id, delta.seconds, new Date(delta.last));
  return merged;
}

/** A stretch longer than this wasn't watched by the timer (the device slept, or the tab was frozen): counted up to it. */
export function stretch_seconds(since: number, now: number, max_ms: number): number {
  return Math.max(0, Math.min(now - since, max_ms)) / 1000;
}

export function format_usage(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = seconds / 3600;
  return `${hours < 10 ? Math.floor(hours * 10) / 10 : Math.floor(hours)} h`;
}
