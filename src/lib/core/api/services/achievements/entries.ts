import { format_usage, type AppUsage } from "../apps/active-time";
import type { AppId } from "../apps/type";
import type { AchievementRecord } from "./persistence";
import type { Achievement, AchievementEntry } from "./type";
import { BUILTIN_PREFIX } from "./validate";

const HOUR = 3600;

interface Builtin {
  id: string;
  title: (verb: string, game: boolean) => string;
  text: (verb: string, game: boolean) => string;
  goal?: number;
  value: (usage: AppUsage | null) => number;
  label?: (n: number) => string;
}

const BUILTINS: Builtin[] = [
  {
    id: "first",
    title: (_, game) => (game ? "First game" : "First look"),
    text: (_, game) => (game ? "Played it once." : "Opened it once."),
    value: (usage) => ((usage?.seconds ?? 0) > 0 ? 1 : 0),
  },
  {
    id: "hour",
    title: () => "An hour in",
    text: (verb) => `${verb} for an hour.`,
    goal: HOUR,
    value: (usage) => usage?.seconds ?? 0,
    label: (n) => (n < 60 ? "0 min" : format_usage(n)),
  },
  {
    id: "days-5",
    title: () => "Regular",
    text: (verb) => `${verb} on 5 different days.`,
    goal: 5,
    value: (usage) => usage?.days ?? 0,
  },
  {
    id: "hours-10",
    title: () => "Ten hours",
    text: (verb) => `${verb} for 10 hours.`,
    goal: 10 * HOUR,
    value: (usage) => usage?.seconds ?? 0,
    label: (n) => (n < 60 ? "0 min" : format_usage(n)),
  },
  {
    id: "days-30",
    title: () => "Old friend",
    text: (verb) => `${verb} on 30 different days.`,
    goal: 30,
    value: (usage) => usage?.days ?? 0,
  },
];

function progress_text(progress: number, goal: number | undefined, label?: (n: number) => string): string | null {
  if (goal === undefined) return null;
  if (!label) return `${Math.floor(progress)} / ${goal}`;
  return `${label(progress)} / ${label(goal)}`;
}

/** The active-time achievements every app has, from its usage: never stored, so they have no unlock time. */
export function builtin_entries(app_id: AppId, usage: AppUsage | null, game: boolean): AchievementEntry[] {
  const verb = game ? "Played" : "Used";
  return BUILTINS.map((builtin) => {
    const value = builtin.value(usage);
    const goal = builtin.goal;
    const unlocked = value >= (goal ?? 1);
    const progress = goal === undefined ? 0 : Math.min(value, goal);
    const def: Achievement = { id: `${BUILTIN_PREFIX}${builtin.id}`, title: builtin.title(verb, game), text: builtin.text(verb, game), goal };
    return { app_id, def, unlocked, unlocked_at: null, progress, progress_text: progress_text(progress, goal, builtin.label), builtin: true };
  });
}

export function declared_entries(app_id: AppId, defs: readonly Achievement[], record: AchievementRecord): AchievementEntry[] {
  return defs.map((def) => {
    const unlocked_at = record.unlocked[def.id] ?? null;
    const unlocked = unlocked_at !== null;
    const raw = record.progress[def.id] ?? 0;
    const progress = def.goal === undefined ? 0 : unlocked ? def.goal : Math.min(raw, def.goal);
    return { app_id, def, unlocked, unlocked_at, progress, progress_text: progress_text(progress, def.goal), builtin: false };
  });
}

/** The record after a change, or `null` when nothing changes. */
export function apply_achieve(record: AchievementRecord, id: string, now: number): AchievementRecord | null {
  if (id in record.unlocked) return null;
  return { ...record, unlocked: { ...record.unlocked, [id]: now } };
}

/** Reaching the goal unlocks; a lower `n` than seen before changes nothing. */
export function apply_progress(record: AchievementRecord, def: Achievement, n: number, now: number): AchievementRecord | null {
  if (def.goal === undefined || !Number.isFinite(n)) return null;
  const before = record.progress[def.id] ?? 0;
  const value = Math.max(before, Math.max(0, n));
  const reached = value >= def.goal && !(def.id in record.unlocked);
  if (value === before && !reached) return null;
  return {
    progress: { ...record.progress, [def.id]: value },
    unlocked: reached ? { ...record.unlocked, [def.id]: now } : record.unlocked,
  };
}
