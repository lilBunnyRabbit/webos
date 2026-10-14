import { ShellError } from "$lib/core/api/services/shell/type";
import { EventColor, minutes_of, new_id, time_of, type CalendarEvent, type Repeat } from "./calendar";
import { pad2 } from "$lib/core/utils";
import { resolve_day, parse_time } from "$lib/core/utils/date";

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
  const day = resolve_day(text, today);
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
  if (args.at !== undefined && (!start || start === "24:00"))
    throw new ShellError(`cal add: "${args.at}" isn't a time; use HH:MM`);
  if (args.until !== undefined && !start) throw new ShellError("cal add: --until needs --at");
  const end =
    args.until === undefined
      ? start
        ? time_of(Math.min(minutes_of(start) + 60, 24 * 60))
        : null
      : parse_time(args.until);
  if (start && !end) throw new ShellError(`cal add: "${args.until}" isn't a time; use HH:MM`);
  if (start && end && minutes_of(end) <= minutes_of(start)) throw new ShellError("cal add: --until must be after --at");
  const reminder = args.remind === undefined ? null : parse_duration(args.remind);
  if (args.remind !== undefined && reminder === null)
    throw new ShellError(`cal add: "${args.remind}" isn't a duration; use minutes, 1h or 1d`);
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
