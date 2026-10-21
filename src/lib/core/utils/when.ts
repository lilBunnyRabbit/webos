import { add_days, format_date_key, format_plain_time, local_date, parse_date, parse_plain_time, wall_to_epoch, zoned_parts } from "./zoned";

const MINUTE = 60_000;
const UNITS: Record<string, number> = { h: 3_600_000, m: MINUTE, s: 1000 };

/** `5m`, `1h30m`, `90s`; a bare number is minutes. Null when it isn't one, or is zero. */
export function parse_duration(text: string): number | null {
  const input = text.trim().toLowerCase();
  if (/^\d+$/.test(input)) return Number(input) * MINUTE || null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(input);
  if (!match || !input) return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * UNITS.h + Number(minutes) * UNITS.m + Number(seconds) * UNITS.s || null;
}

export function parse_alarm_time(text: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? `${String(hours).padStart(2, "0")}:${match[2]}` : null;
}

/** A moment the user typed: an absolute instant (`10m` from now), or a wall time in a zone. */
export type When = { epoch: number } | { date: string; time: string; tz: string };

/**
 * `10m`, `1h30m` (from `now`), `18:30` (the next one), `today 18:30`, `tomorrow 9:00`, `2026-12-24 18:00`. Wall times
 * are in `zone`. Null when it's none of these, or a dated time that has already passed.
 */
export function parse_when(text: string, now: number, zone: string): When | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, " ");
  const [first, second, ...rest] = input.split(" ");
  if (rest.length > 0) return null;

  if (second === undefined) {
    const time = parse_alarm_time(first);
    if (time) {
      const today = local_date(now, zone);
      const at = parse_plain_time(time)!;
      const date = wall_to_epoch(today, at, zone) > now ? today : add_days(today, 1);
      return { date: format_date_key(date), time, tz: zone };
    }
    const ms = parse_duration(first);
    return ms === null ? null : { epoch: now + ms };
  }

  const time = parse_alarm_time(second);
  if (!time) return null;
  const today = local_date(now, zone);
  const date = first === "today" ? today : first === "tomorrow" ? add_days(today, 1) : parse_date(first);
  if (!date || wall_to_epoch(date, parse_plain_time(time)!, zone) <= now) return null;
  return { date: format_date_key(date), time, tz: zone };
}

export function when_examples(now: number, zone: string): string[] {
  const { hours, minutes } = zoned_parts(now + 30 * MINUTE, zone);
  return [format_plain_time({ hours, minutes: Math.floor(minutes / 15) * 15 }), "10m", "1h", "tomorrow 9:00"];
}
