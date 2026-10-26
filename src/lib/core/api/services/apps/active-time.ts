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

export function format_usage(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = seconds / 3600;
  return `${hours < 10 ? Math.floor(hours * 10) / 10 : Math.floor(hours)} h`;
}

export interface Milestone {
  id: string;
  label: string;
  done: boolean;
}

const HOUR = 3600;

export function milestones(usage: AppUsage | null, game: boolean): Milestone[] {
  const verb = game ? "Played" : "Used";
  const seconds = usage?.seconds ?? 0;
  const days = usage?.days ?? 0;
  return [
    { id: "first", label: game ? "Played it once" : "Opened it once", done: seconds > 0 },
    { id: "hour", label: `${verb} for an hour`, done: seconds >= HOUR },
    { id: "days-5", label: `${verb} on 5 different days`, done: days >= 5 },
    { id: "hours-10", label: `${verb} for 10 hours`, done: seconds >= 10 * HOUR },
    { id: "days-30", label: `${verb} on 30 different days`, done: days >= 30 },
  ];
}
