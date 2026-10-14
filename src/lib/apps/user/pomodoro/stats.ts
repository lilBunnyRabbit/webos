import { day_key } from "$lib/core/games/time";
import { z } from "zod";

export const DayStatsSchema = z.object({
  sessions: z.number().int().min(0),
  ms: z.number().min(0),
});
export type DayStats = z.infer<typeof DayStatsSchema>;

export const StatsFileSchema = z.object({
  version: z.literal(1),
  days: z.record(z.string(), DayStatsSchema),
});
export type StatsFile = z.infer<typeof StatsFileSchema>;

export const EMPTY_STATS: StatsFile = { version: 1, days: {} };

const DAY = 86_400_000;

export function record_focus(stats: StatsFile, ended_at: number, ms: number): StatsFile {
  const day = day_key(new Date(ended_at));
  const current = stats.days[day] ?? { sessions: 0, ms: 0 };
  return { ...stats, days: { ...stats.days, [day]: { sessions: current.sessions + 1, ms: current.ms + ms } } };
}

export function day_stats(stats: StatsFile, day: string): DayStats {
  return stats.days[day] ?? { sessions: 0, ms: 0 };
}

// Local noon keeps the day arithmetic away from DST edges.
function shift(date: Date, days: number): Date {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  return new Date(noon.getTime() + days * DAY);
}

export interface DayBar extends DayStats {
  day: string;
  date: Date;
}

export function last_days(stats: StatsFile, today: Date, count = 7): DayBar[] {
  return Array.from({ length: count }, (_, index) => {
    const date = shift(today, index - count + 1);
    const day = day_key(date);
    return { day, date, ...day_stats(stats, day) };
  });
}

export function streak(stats: StatsFile, today: Date): number {
  let offset = day_stats(stats, day_key(today)).sessions > 0 ? 0 : -1;
  let count = 0;
  while (day_stats(stats, day_key(shift(today, offset))).sessions > 0) {
    count++;
    offset--;
  }
  return count;
}

export function totals(stats: StatsFile): DayStats {
  return Object.values(stats.days).reduce((sum, day) => ({ sessions: sum.sessions + day.sessions, ms: sum.ms + day.ms }), { sessions: 0, ms: 0 });
}

export function format_minutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
