// Kept apart from hub.ts: the manifest imports these at boot, and a module the app also imports lands whole in the boot chunk.
export const HUB_ID = "game-hub";

export const Tab = { LIBRARY: "library", TODAY: "today", STATS: "stats", ACHIEVEMENTS: "achievements" } as const;
export type Tab = (typeof Tab)[keyof typeof Tab];

export function format_duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes === 0) return `${Math.floor(Math.max(0, ms) / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

export function format_last_played(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (!iso || Number.isNaN(then.getTime())) return "";
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
