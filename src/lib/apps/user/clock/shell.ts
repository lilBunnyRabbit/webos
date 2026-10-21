import kernel, { type AppsService, type DesktopService, type SchedulerService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { format_time } from "$kit/games";
import { parse_alarm_time, parse_duration } from "$lib/core/utils/when";
import {
  alarm_job_id,
  APP_ID,
  clock_alarms,
  clock_timers,
  ClockFace,
  ClockTab,
  find_entry,
  format_duration,
  format_hm,
  format_until,
  is_snoozed,
  parse_days,
  repeat_label,
  timer_remaining,
  timer_state,
  type Alarm,
  type Timer,
} from "./clock";
import { add_timer, clock_file, delete_alarm, remove_timer, restart_timer, save_alarm, snooze_alarm, stop_alarm, switch_alarm } from "./jobs";
import {
  all_zones,
  format_offset,
  format_utc_offset,
  format_wall,
  is_zone,
  local_zone,
  search_places,
  wall_time,
  zone_offset,
} from "./zones";

const scheduler = () => kernel.service<SchedulerService>("scheduler");

function launch(tab?: ClockTab): void {
  kernel.service<AppsService>("apps").launch(APP_ID, tab ? { tab } : {});
}

export function open_app({ args }: CommandContext<{ tab?: ClockTab }>): void {
  launch(args.tab);
}

export function open_alarms(): void {
  launch(ClockTab.ALARMS);
}

export function open_timers(): void {
  launch(ClockTab.TIMERS);
}

export function alarm_value(alarm: Alarm, now: number): Tagged {
  const snoozed = is_snoozed(alarm, now);
  return {
    $type: "alarm",
    id: alarm.id,
    time: alarm.time,
    repeat: repeat_label(alarm.days),
    label: alarm.label,
    on: alarm.on,
    next: alarm.next !== null && alarm.next > now ? `${snoozed ? "snoozed, " : ""}${format_hm(alarm.next)}, ${format_until(alarm.next - now)}` : "",
  };
}

export function timer_value(timer: Timer, now: number): Tagged {
  return {
    $type: "timer",
    id: timer.id,
    label: timer.label,
    left: format_time(Math.ceil(timer_remaining(timer, now) / 1000) * 1000),
    duration: format_duration(timer.duration_ms),
    state: timer_state(timer),
  };
}

async function alarms_now(): Promise<Alarm[]> {
  return clock_alarms(scheduler().jobs, await clock_file.read());
}

async function timers_now(): Promise<Timer[]> {
  return clock_timers(scheduler().jobs, await clock_file.read());
}

function found<T extends { id: string; label: string }>(entries: T[], query: string, noun: string): T {
  const entry = find_entry(entries, query, noun);
  if (typeof entry === "string") throw new ShellError(entry);
  return entry;
}

async function alarm_after(id: string): Promise<Tagged> {
  const alarm = (await alarms_now()).find((entry) => entry.id === id);
  if (!alarm) throw new ShellError(`alarm ${id} is gone`);
  return alarm_value(alarm, Date.now());
}

export async function* alarms(): AsyncGenerator<Tagged> {
  const now = Date.now();
  yield* (await alarms_now()).map((alarm) => alarm_value(alarm, now));
}

export async function alarm_add({ args }: CommandContext<{ time: string; days?: string; label: string[] }>): Promise<Tagged> {
  const time = parse_alarm_time(args.time);
  if (!time) throw new ShellError(`alarm add: "${args.time}" isn't a time like 07:30`);
  const days = args.days === undefined ? [] : parse_days(args.days);
  if (!days) throw new ShellError(`alarm add: "${args.days}" isn't days like mon,wed, weekdays or weekends`);
  return alarm_after(await save_alarm(null, { time, days, label: args.label.join(" ") }));
}

export async function alarm_switch({ args }: CommandContext<{ alarm: string }>, on: boolean): Promise<Tagged> {
  const alarm = found(await alarms_now(), args.alarm, "alarm");
  await switch_alarm(alarm.job, on);
  return alarm_after(alarm.id);
}

export async function alarm_snooze({ args }: CommandContext<{ alarm: string; duration: string }>): Promise<Tagged> {
  const ms = parse_duration(args.duration);
  if (!ms) throw new ShellError(`alarm snooze: "${args.duration}" isn't a duration like 10m or 1h`);
  const alarm = found(await alarms_now(), args.alarm, "alarm");
  await snooze_alarm(alarm.job, ms);
  return alarm_after(alarm.id);
}

export async function alarm_stop({ args }: CommandContext<{ alarm: string }>): Promise<Tagged> {
  const alarm = found(await alarms_now(), args.alarm, "alarm");
  await stop_alarm(alarm.job);
  return alarm_after(alarm.id);
}

export async function alarm_rm({ args }: CommandContext<{ alarm: string }>): Promise<string> {
  const alarm = found(await alarms_now(), args.alarm, "alarm");
  await delete_alarm(alarm_job_id(alarm.id));
  return `removed the ${alarm.time} alarm${alarm.label ? ` (${alarm.label})` : ""}`;
}

export async function timer_start({ args }: CommandContext<{ duration: string; label: string[] }>): Promise<Tagged> {
  const ms = parse_duration(args.duration);
  if (!ms) throw new ShellError(`timer: "${args.duration}" isn't a duration like 5m, 1h30m or 90s`);
  return timer_value(await add_timer(args.label.join(" "), ms), Date.now());
}

export async function* timers(): AsyncGenerator<Tagged> {
  const now = Date.now();
  yield* (await timers_now()).map((timer) => timer_value(timer, now));
}

export async function timer_restart({ args }: CommandContext<{ timer: string }>): Promise<Tagged> {
  const timer = found(await timers_now(), args.timer, "timer");
  await restart_timer(timer);
  const restarted = (await timers_now()).find((entry) => entry.id === timer.id);
  if (!restarted) throw new ShellError(`timer ${timer.id} is gone`);
  return timer_value(restarted, Date.now());
}

export async function timer_stop({ args }: CommandContext<{ timer: string }>): Promise<string> {
  const timer = found(await timers_now(), args.timer, "timer");
  await remove_timer(timer);
  return `stopped ${timer.label || format_duration(timer.duration_ms)}`;
}

export async function pin({ args }: CommandContext<{ face: ClockFace }>): Promise<string> {
  const name = await kernel
    .service<DesktopService>("desktop")
    .pin_widget(APP_ID, { label: "Clock", props: { face: args.face } });
  if (!name) throw new ShellError("clock pin: couldn't pin the clock");
  return `pinned ${name} to the desktop`;
}

export function resolve_zone(query: string): string | null {
  const zones = all_zones();
  const exact = zones.find((zone) => zone.toLowerCase() === query.toLowerCase());
  if (exact) return exact;
  const found = search_places(zones, query, 1)[0];
  if (found) return found.zone;
  return is_zone(query) ? query : null;
}

export function time({ args }: CommandContext<{ zone?: string }>): string {
  const home = local_zone();
  const zone = args.zone ? resolve_zone(args.zone) : home;
  if (!zone) throw new ShellError(`time: no time zone "${args.zone}"`);
  const now = Date.now();
  const date = new Date(now).toLocaleDateString("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const offset = zone_offset(now, zone);
  const parts = [format_wall(wall_time(now, zone), true), zone, date, format_utc_offset(offset)];
  if (zone !== home) parts.push(format_offset(offset - zone_offset(now, home)));
  return parts.join("  ");
}

export function complete_zones(partial: string) {
  const now = Date.now();
  return search_places(all_zones(), partial).map((place) => ({
    value: place.entry === place.zone ? place.zone : place.name,
    detail: format_wall(wall_time(now, place.zone)),
  }));
}
