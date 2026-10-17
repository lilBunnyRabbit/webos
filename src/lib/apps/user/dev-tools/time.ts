export const TimeUnit = {
  SECONDS: "seconds",
  MILLISECONDS: "milliseconds",
  MICROSECONDS: "microseconds",
  NANOSECONDS: "nanoseconds",
  DATE: "date",
  NOW: "now",
} as const;
export type TimeUnit = (typeof TimeUnit)[keyof typeof TimeUnit];

export type TimeParse = { ok: true; ms: number; unit: TimeUnit } | { ok: false; error: string };

export interface TimeRow {
  label: string;
  value: string;
}

const MAX_MS = 8.64e15;

// A bare number's unit is guessed from its size: seconds until the year 5138, then ms, µs and ns.
const NUMBER_UNITS = [
  { below: 1e11, unit: TimeUnit.SECONDS, per_ms: 1e-3 },
  { below: 1e14, unit: TimeUnit.MILLISECONDS, per_ms: 1 },
  { below: 1e17, unit: TimeUnit.MICROSECONDS, per_ms: 1e3 },
  { below: Infinity, unit: TimeUnit.NANOSECONDS, per_ms: 1e6 },
] as const;

export function parse_time(input: string, now = Date.now()): TimeParse {
  const text = input.trim();
  if (text === "" || text.toLowerCase() === "now") return { ok: true, ms: now, unit: TimeUnit.NOW };

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const number = Number(text);
    const { unit, per_ms } = NUMBER_UNITS.find((entry) => Math.abs(number) < entry.below) ?? NUMBER_UNITS[3];
    const ms = Math.round(number / per_ms);
    if (Math.abs(ms) > MAX_MS) return { ok: false, error: "Too far from 1970 to be a date" };
    return { ok: true, ms, unit };
  }

  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return { ok: false, error: "Not a timestamp or a date this browser can read" };
  return { ok: true, ms, unit: TimeUnit.DATE };
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_557_600],
  ["month", 2_629_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

const relative_format = new Intl.RelativeTimeFormat("en", { numeric: "always" });

export function relative_time(ms: number, now = Date.now()): string {
  const seconds = (ms - now) / 1000;
  const step = RELATIVE_STEPS.find(([, size]) => Math.abs(seconds) >= size);
  return step ? relative_format.format(Math.trunc(seconds / step[1]), step[0]) : "now";
}

export function local_zone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function all_zones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

export function is_zone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function format_in_zone(ms: number, zone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "shortOffset",
    })
      .formatToParts(ms)
      .map((part) => [part.type, part.value])
  );
  // ICU builds differ on a zero offset: Node says "GMT", Chromium "GMT+0".
  const offset = parts.timeZoneName === "GMT+0" ? "GMT" : parts.timeZoneName;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}

export interface TimeFields {
  unix: number;
  ms: number;
  iso: string;
  utc: string;
  zone: string;
  local: string;
  weekday: string;
  relative: string;
}

export function time_fields(ms: number, zone: string, now = Date.now()): TimeFields {
  const date = new Date(ms);
  return {
    unix: Math.floor(ms / 1000),
    ms,
    iso: date.toISOString(),
    utc: date.toUTCString(),
    zone,
    local: format_in_zone(ms, zone),
    weekday: date.toLocaleDateString("en-US", { timeZone: zone, weekday: "long" }),
    relative: relative_time(ms, now),
  };
}

export function time_rows(ms: number, zone: string, now = Date.now()): TimeRow[] {
  const fields = time_fields(ms, zone, now);
  return [
    { label: "Unix seconds", value: String(fields.unix) },
    { label: "Unix ms", value: String(fields.ms) },
    { label: "ISO 8601", value: fields.iso },
    { label: "UTC", value: fields.utc },
    { label: zone, value: fields.local },
    { label: "Weekday", value: fields.weekday },
    { label: "Relative", value: fields.relative },
  ];
}
