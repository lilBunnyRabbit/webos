import { pad2 } from "$lib/core/utils";

export interface CronRange {
  start: number;
  end: number;
  step: number;
  /** Written as `*` or `*\/n`. */
  all: boolean;
}

export interface CronField {
  ranges: CronRange[];
  values: ReadonlySet<number>;
}

export interface CronSchedule {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  weekday: CronField;
}

export type CronParse = { ok: true; schedule: CronSchedule } | { ok: false; error: string };

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const FIELDS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS },
  // 7 is Sunday as well as 0, as every cron accepts.
  { name: "day of week", min: 0, max: 7, names: WEEKDAYS },
];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export const MAX_RUNS = 100;
export const DEFAULT_RUNS = 10;

function parse_value(text: string, spec: FieldSpec): number | string {
  const named = spec.names?.indexOf(text.toLowerCase()) ?? -1;
  if (named >= 0) return named + (spec.names === MONTHS ? 1 : 0);
  if (!/^\d+$/.test(text)) return `${spec.name}: "${text}" isn't a number${spec.names ? " or a name" : ""}`;
  const value = Number(text);
  if (value < spec.min || value > spec.max) return `${spec.name}: ${value} is outside ${spec.min}–${spec.max}`;
  return value;
}

function parse_field(text: string, spec: FieldSpec): CronField | string {
  const ranges: CronRange[] = [];
  for (const item of text.split(",")) {
    const [base, step_text, extra] = item.split("/");
    if (extra !== undefined || base === "") return `${spec.name}: "${item}" isn't a value, range or step`;
    let step = 1;
    if (step_text !== undefined) {
      if (!/^\d+$/.test(step_text) || Number(step_text) === 0) return `${spec.name}: step "${step_text}" must be 1 or more`;
      step = Number(step_text);
    }

    if (base === "*") {
      ranges.push({ start: spec.min, end: spec.names === WEEKDAYS ? 6 : spec.max, step, all: true });
      continue;
    }
    const [from, to, more] = base.split("-");
    if (more !== undefined) return `${spec.name}: "${base}" isn't a range`;
    const start = parse_value(from, spec);
    if (typeof start === "string") return start;
    const end = to === undefined ? (step_text === undefined ? start : spec.max) : parse_value(to, spec);
    if (typeof end === "string") return end;
    if (end < start) return `${spec.name}: ${from}-${to} runs backwards`;
    ranges.push({ start, end, step, all: false });
  }

  const values = new Set<number>();
  for (const range of ranges)
    for (let value = range.start; value <= range.end; value += range.step)
      values.add(spec.names === WEEKDAYS && value === 7 ? 0 : value);
  return { ranges, values };
}

export function parse_cron(expression: string): CronParse {
  const text = expression.trim();
  const expanded = MACROS[text.toLowerCase()] ?? text;
  if (expanded.startsWith("@")) return { ok: false, error: `Unknown macro ${text}` };
  const parts = expanded.split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return { ok: false, error: "Give five fields: minute hour day-of-month month day-of-week" };

  const fields: CronField[] = [];
  for (const [index, part] of parts.entries()) {
    const field = parse_field(part, FIELDS[index]);
    if (typeof field === "string") return { ok: false, error: field };
    fields.push(field);
  }
  const [minute, hour, day, month, weekday] = fields;
  return { ok: true, schedule: { minute, hour, day, month, weekday } };
}

const restricted = (field: CronField) => !field.ranges.some((range) => range.all);

// Classic cron: when both day fields are restricted a day matches either one, otherwise only the restricted one counts.
function day_matches(schedule: CronSchedule, date: Date): boolean {
  const by_day = schedule.day.values.has(date.getDate());
  const by_weekday = schedule.weekday.values.has(date.getDay());
  if (restricted(schedule.day) && restricted(schedule.weekday)) return by_day || by_weekday;
  return by_day && by_weekday;
}

/** Leap-day schedules can wait years, so the search covers a few leap cycles before giving up. */
const SEARCH_DAYS = 366 * 28;

export function next_runs(schedule: CronSchedule, from: Date, count: number): Date[] {
  const runs: Date[] = [];
  const hours = [...schedule.hour.values].sort((a, b) => a - b);
  const minutes = [...schedule.minute.values].sort((a, b) => a - b);
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let i = 0; i < SEARCH_DAYS && runs.length < count; i++, day.setDate(day.getDate() + 1)) {
    if (!schedule.month.values.has(day.getMonth() + 1) || !day_matches(schedule, day)) continue;
    for (const hour of hours) {
      for (const minute of minutes) {
        const run = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
        // A wall time skipped by a DST jump lands on another hour; cron doesn't run it.
        if (run.getHours() !== hour || run <= from) continue;
        runs.push(run);
        if (runs.length === count) return runs;
      }
    }
  }
  return runs;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function join_list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const ordinal_rules = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIXES: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinal = (value: number) => `${value}${SUFFIXES[ordinal_rules.select(value)]}`;

const single = (field: CronField) => field.ranges.every((range) => !range.all && range.start === range.end);

function describe_ranges(field: CronField, name: (value: number) => string): string {
  return join_list(
    field.ranges.map((range) => {
      if (range.start === range.end) return name(range.start);
      const span = `${name(range.start)} through ${name(range.end === 7 ? 0 : range.end)}`;
      return range.step === 1 ? span : `every ${ordinal(range.step)} from ${span}`;
    })
  );
}

function every(field: CronField, unit: string): string | null {
  const [range] = field.ranges;
  if (field.ranges.length !== 1 || !range.all) return null;
  return range.step === 1 ? `every ${unit}` : `every ${range.step} ${unit}s`;
}

function describe_time(minute: CronField, hour: CronField): string {
  if (single(minute) && single(hour) && minute.values.size * hour.values.size <= 6) {
    const times = [...hour.values].sort((a, b) => a - b).flatMap((h) => [...minute.values].sort((a, b) => a - b).map((m) => `${pad2(h)}:${pad2(m)}`));
    return `At ${join_list(times)}`;
  }

  const each_minute = every(minute, "minute");
  const minutes = each_minute
    ? each_minute[0].toUpperCase() + each_minute.slice(1)
    : `At ${minute.values.size === 1 ? "minute" : "minutes"} ${describe_ranges(minute, String)}`;

  const hours = every(hour, "hour");
  if (hours === "every hour") return each_minute ? minutes : `${minutes} of every hour`;
  if (hours) return `${minutes}, ${hours}`;
  const [range] = hour.ranges;
  if (hour.ranges.length === 1 && range.step === 1 && range.start !== range.end)
    return `${minutes}, between ${pad2(range.start)}:00 and ${pad2(range.end)}:59`;
  return `${minutes}, during ${hour.values.size === 1 ? "hour" : "hours"} ${describe_ranges(hour, pad2)}`;
}

export function describe_cron(schedule: CronSchedule): string {
  const parts = [describe_time(schedule.minute, schedule.hour)];

  const days: string[] = [];
  if (restricted(schedule.day)) days.push(`on the ${describe_ranges(schedule.day, ordinal)} of the month`);
  else if (schedule.day.ranges[0].step > 1) days.push(`every ${schedule.day.ranges[0].step} days`);
  if (restricted(schedule.weekday)) days.push(`on ${describe_ranges(schedule.weekday, (d) => WEEKDAY_NAMES[d % 7])}`);
  if (days.length) parts.push(days.join(" or "));

  if (restricted(schedule.month)) parts.push(`in ${describe_ranges(schedule.month, (m) => MONTH_NAMES[m - 1])}`);
  else if (schedule.month.ranges[0].step > 1) parts.push(`every ${schedule.month.ranges[0].step} months`);

  return parts.join(", ");
}
