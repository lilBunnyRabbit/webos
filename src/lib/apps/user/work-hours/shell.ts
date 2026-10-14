import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { print_html } from "$lib/core/utils/print";
import { parse_day, parse_time } from "$lib/apps/user/calendar/parse";
import {
  add_entry,
  clock_time,
  day_key,
  day_minutes,
  day_span,
  entry_error,
  entry_minutes,
  format_hours,
  month_key,
  month_minutes,
  month_of,
  new_entry_id,
  parse_target,
  running_minutes,
  set_target,
  sorted_entries,
  WORK_HOURS_APP_ID,
} from "./data";
import { parse_month } from "./parse";
import { month_label, month_report_html } from "./report";
import { clock_in, clock_out, edit_month, read_month, read_state } from "./store";

interface Row {
  day: string;
  start: string;
  end: string;
  minutes: number;
  work: string;
}

export function workday_value(row: Row): Tagged {
  return { $type: "workday", day: row.day, in: row.start, out: row.end, hours: Math.round((row.minutes / 60) * 100) / 100, minutes: row.minutes, work: row.work };
}

export function open_day(day: string): void {
  kernel.service<AppsService>("apps").launch(WORK_HOURS_APP_ID, { day });
}

function month_arg(text: string | undefined): string {
  const month = parse_month(text ?? "", month_key(new Date()));
  if (!month) throw new ShellError(`"${text}" isn't a month; use YYYY-MM, a month number, last or next`);
  return month;
}

export async function clock_on({ args }: CommandContext<{ description: string[] }>): Promise<string> {
  const now = new Date();
  const state = await clock_in(args.description.join(" ").trim(), now);
  const running = state.running!;
  const at = clock_time(new Date(running.start));
  if (running.start !== now.toISOString()) throw new ShellError(`already clocked in since ${at}; wh out first`);
  return `clocked in at ${at}${running.description ? ` · ${running.description}` : ""}`;
}

export async function* clock_off(): AsyncGenerator<Tagged | string> {
  const { running } = await read_state();
  if (!running) throw new ShellError("not clocked in");
  const booked = await clock_out();
  if (!booked.length) {
    yield "under a minute, nothing booked";
    return;
  }
  for (const segment of booked) yield workday_value({ ...segment, minutes: entry_minutes(segment), work: running.description.trim() });
}

export async function status(): Promise<string> {
  const now = new Date();
  const today = day_key(now);
  const [{ running }, file] = await Promise.all([read_state(), read_month(month_of(today))]);
  const live = running && day_key(new Date(running.start)) === today ? running_minutes(running, now) : 0;
  const head = running
    ? `clocked in at ${clock_time(new Date(running.start))} · ${format_hours(running_minutes(running, now))} so far${running.description ? ` · ${running.description}` : ""}`
    : "clocked out";
  const total = month_minutes(file) + live;
  const target = file.target_hours !== null ? ` of ${format_hours(file.target_hours * 60)} (${file.target_hours ? Math.round((total / (file.target_hours * 60)) * 100) : 100}%)` : "";
  return `${head}\ntoday ${format_hours(day_minutes(file.days[today]) + live)} · ${month_label(file.month)} ${format_hours(total)}${target}`;
}

export async function* list({ args }: CommandContext<{ month?: string }>): AsyncGenerator<Tagged> {
  const file = await read_month(month_arg(args.month));
  for (const day of Object.keys(file.days).sort()) {
    const data = file.days[day];
    const span = day_span(data);
    if (!span) continue;
    const work = [...new Set(sorted_entries(data).map((entry) => entry.description.trim()).filter(Boolean))].join("; ");
    yield workday_value({ day, start: span.start, end: span.end, minutes: day_minutes(data), work });
  }
}

export async function add({ args }: CommandContext<{ date: string; start: string; end: string; description: string[] }>): Promise<Tagged> {
  const day = parse_day(args.date, day_key(new Date()));
  if (!day) throw new ShellError(`wh add: "${args.date}" isn't a day; use YYYY-MM-DD, today or yesterday`);
  const start = parse_time(args.start);
  const end = parse_time(args.end);
  const error = start && end ? entry_error(start, end) : "Enter a start and an end time as HH:MM";
  if (error || !start || !end) throw new ShellError(`wh add: ${error?.toLowerCase()}`);
  const entry = { id: new_entry_id(), start, end, description: args.description.join(" ").trim() };
  await edit_month(month_of(day), (file) => add_entry(file, day, entry));
  return workday_value({ day, start, end, minutes: entry_minutes(entry), work: entry.description });
}

export async function report({ args }: CommandContext<{ month?: string }>): Promise<string> {
  const file = await read_month(month_arg(args.month));
  await print_html(month_report_html(file, { generated: new Date() }), { title: `Time sheet ${file.month}` });
  return `printed the time sheet for ${month_label(file.month)}`;
}

export async function target({ args }: CommandContext<{ hours: string; month?: string }>): Promise<string> {
  const month = month_arg(args.month);
  const hours = args.hours.trim().toLowerCase() === "none" ? null : parse_target(args.hours);
  if (hours === undefined || args.hours.trim() === "") throw new ShellError(`wh target: "${args.hours}" isn't a number of hours or none`);
  await edit_month(month, (file) => set_target(file, hours));
  return hours === null ? `no target for ${month_label(month)}` : `target for ${month_label(month)}: ${format_hours(hours * 60)}`;
}
