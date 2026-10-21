/** `month` is 1–12. */
export interface PlainDate {
  year: number;
  month: number;
  day: number;
}

export interface PlainTime {
  hours: number;
  minutes: number;
}

export interface ZonedParts extends PlainDate, PlainTime {
  seconds: number;
}

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, format);
  }
  return format;
}

export function is_valid_zone(zone: string): boolean {
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

export function local_zone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function zoned_parts(epoch: number, zone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(epoch)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hours: parts.hour, minutes: parts.minute, seconds: parts.second };
}

export function zone_offset(epoch: number, zone: string): number {
  const parts = zoned_parts(epoch, zone);
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, parts.seconds);
  return wall - Math.floor(epoch / 1000) * 1000;
}

/**
 * The instant the wall clock in `zone` reads `date` `time`. A time a forward jump skips (a DST gap, a skipped day) is
 * shifted forward by the gap: 02:30 on a spring-forward night is 03:30. A time a backward jump repeats is its first
 * pass, the earlier instant. Assumes at most one transition within a day either side, true of every zone in tzdata.
 */
export function wall_to_epoch(date: PlainDate, time: PlainTime, zone: string): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day, time.hours, time.minutes);
  const before = zone_offset(wall - DAY_MS, zone);
  const after = zone_offset(wall + DAY_MS, zone);
  const valid = [before, after].map((offset) => wall - offset).filter((epoch) => zone_offset(epoch, zone) === wall - epoch);
  if (valid.length > 0) return Math.min(...valid);
  return wall - before;
}

export function local_date(epoch: number, zone: string): PlainDate {
  const { year, month, day } = zoned_parts(epoch, zone);
  return { year, month, day };
}

export function parse_date(text: string): PlainDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > days_in_month(date.year, date.month)) return null;
  return date;
}

export function format_date_key(date: PlainDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function parse_plain_time(text: string): PlainTime | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

export function format_plain_time(time: PlainTime): string {
  return `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
}

export function days_in_month(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function utc_day(date: PlainDate): number {
  const day = new Date(0);
  day.setUTCFullYear(date.year, date.month - 1, date.day);
  return day.getTime();
}

function from_utc_day(epoch: number): PlainDate {
  const day = new Date(epoch);
  return { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() };
}

export function add_days(date: PlainDate, days: number): PlainDate {
  return from_utc_day(utc_day(date) + days * DAY_MS);
}

export function days_between(a: PlainDate, b: PlainDate): number {
  return Math.round((utc_day(b) - utc_day(a)) / DAY_MS);
}

/** 0 = Sunday, as `Date.getDay()`. */
export function day_of_week(date: PlainDate): number {
  return new Date(utc_day(date)).getUTCDay();
}

export function compare_dates(a: PlainDate, b: PlainDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}
