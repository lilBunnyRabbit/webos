export interface FormatTimeOptions {
  /** Adds tenths of a second: `1:05.3`. */
  tenths?: boolean;
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function format_time(ms: number, options: FormatTimeOptions = {}): string {
  const safe = Math.max(0, ms);
  const total = Math.floor(safe / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  const tail = options.tenths ? `.${Math.floor(safe / 100) % 10}` : "";
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}${tail}` : `${minutes}:${seconds}${tail}`;
}

/** Local calendar day, `YYYY-MM-DD`: a daily puzzle changes at the player's midnight. */
export function day_key(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The same seed for every player on a day, different per game (FNV-1a over the day and the app id). */
export function daily_seed(day: string, app_id: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${day}:${app_id}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
