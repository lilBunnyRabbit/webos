import { ShellError } from "$lib/core/api/services/shell/type";
import { EventColor, minutes_of, new_id, time_of, type CalendarEvent, type Repeat } from "./calendar";

const pad =(value: number) => String(value).padStart(2, "0");

function days_in(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shift(day: string, by: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + by));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function valid(year: number, month: number, date: number): string | null {
  if (month < 1 || month > 12 || date < 1 || date > days_in(year, month)) return null;
  return `${year}-${pad(month)}-${pad(date)}`;
}

const NAMED: Record<string, number> = { today: 0, yesterday: -1, tomorrow: 1 };

/**
 * `today`, `yesterday`, `tomorrow`, `+N` / `-N` days, `YYYY-MM-DD`, `MM-DD` (this year) or `D` (this month). `null`
 * when it isn't a real day.
 */
export function parse_day(text: string, today: string): string | null {
  const value = text.trim().toLowerCase();
  if (value in NAMED) return shift(today, NAMED[value]);
  if (/^[+-]\d{1,4}$/.test(value)) return shift(today, Number(value));
  const [year, month] = today.split("-").map(Number);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return valid(year, Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})$/.exec(value);
  if (match) return valid(year, month, Number(match[1]));
  return null;
}

/** `9`, `09`, `9:30`, `09:30` or `24:00` to `HH:MM`; `null` otherwise. */
export function parse_time(text: string): string | null {
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

const UNITS: Record<string, number> = { w: 10080, d: 1440, h: 60, m: 1 };

/** Minutes from `15` (bare minutes), `5m`, `1h30m`, `2d` or `1w`; `null` otherwise. */
export function parse_duration(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/.exec(value);
  if (!value || !match) return null;
  return ["w", "d", "h", "m"].reduce((total, unit, index) => total + Number(match[index + 1] ?? 0) * UNITS[unit], 0);
}

export function day_arg(text: string | undefined, what: string, today: string): string {
  if (text === undefined) return today;
  const day = parse_day(text, today);
  if (!day) throw new ShellError(`${what}: "${text}" isn't a day; use YYYY-MM-DD, today, tomorrow or +N`);
  return day;
}

export interface AddArgs {
  title: string[];
  day: string;
  at?: string;
  until?: string;
  repeat?: Repeat;
  remind?: string;
}

/** No `--at` is an all-day event; `--at` alone lasts an hour, cut at midnight. */
export function event_from_args(args: AddArgs, today: string): CalendarEvent {
  const title = args.title.join(" ").trim();
  if (!title) throw new ShellError("cal add: give the event a title");
  const day = day_arg(args.day, "cal add", today);
  const start = args.at === undefined ? null : parse_time(args.at);
  if (args.at !== undefined && (!start || start === "24:00")) throw new ShellError(`cal add: "${args.at}" isn't a time; use HH:MM`);
  if (args.until !== undefined && !start) throw new ShellError("cal add: --until needs --at");
  const end = args.until === undefined ? (start ? time_of(Math.min(minutes_of(start) + 60, 24 * 60)) : null) : parse_time(args.until);
  if (start && !end) throw new ShellError(`cal add: "${args.until}" isn't a time; use HH:MM`);
  if (start && end && minutes_of(end) <= minutes_of(start)) throw new ShellError("cal add: --until must be after --at");
  const reminder = args.remind === undefined ? null : parse_duration(args.remind);
  if (args.remind !== undefined && reminder === null) throw new ShellError(`cal add: "${args.remind}" isn't a duration; use minutes, 1h or 1d`);
  return {
    id: new_id(),
    title,
    day,
    all_day: start === null,
    start: start ?? "09:00",
    end: end ?? "10:00",
    repeat: args.repeat ? { every: args.repeat, until: null } : null,
    skip: [],
    notes: "",
    color: EventColor.PRIMARY,
    reminder,
    last_notified: null,
  };
}
