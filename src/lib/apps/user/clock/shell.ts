import kernel, { type AppsService, type DesktopService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { format_time } from "$kit/games";
import { parse_alarm_time, parse_duration } from "$lib/core/utils/when";
import {
  APP_ID,
  check_alarm,
  ClockFace,
  ClockTab,
  find_entry,
  format_duration,
  format_hm,
  format_until,
  new_id,
  parse_days,
  repeat_label,
  start_timer,
  timer_remaining,
  timer_state,
  type Alarm,
  type ClockData,
  type Timer,
} from "./clock";
import { clock_file, ring_while_timers } from "./ringer.svelte";
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

async function with_clock<T>(action: (data: ClockData) => T): Promise<T> {
  let result!: T;
  const data = await clock_file.edit((value) => {
    result = action(value);
    return value;
  });
  ring_if_timers(data);
  return result;
}

function ring_if_timers(data: ClockData): void {
  if (data.timers.some((timer) => timer.end_at !== null)) ring_while_timers();
}

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
  const { at } = check_alarm(alarm, now);
  return {
    $type: "alarm",
    id: alarm.id,
    time: alarm.time,
    repeat: repeat_label(alarm.days),
    label: alarm.label,
    on: alarm.enabled,
    next: at !== null && at > now ? `${format_hm(at)}, ${format_until(at - now)}` : "",
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

export async function* alarms(): AsyncGenerator<Tagged> {
  const now = Date.now();
  const list = (await clock_file.read()).alarms.map((alarm) => alarm_value(alarm, now));
  yield* list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export function alarm_add({ args }: CommandContext<{ time: string; days?: string; label: string[] }>): Promise<Tagged> {
  const time = parse_alarm_time(args.time);
  if (!time) throw new ShellError(`alarm add: "${args.time}" isn't a time like 07:30`);
  const days = args.days === undefined ? [] : parse_days(args.days);
  if (!days) throw new ShellError(`alarm add: "${args.days}" isn't days like mon,wed, weekdays or weekends`);
  const now = Date.now();
  const alarm: Alarm = {
    id: new_id(),
    time,
    days,
    label: args.label.join(" ").trim(),
    enabled: true,
    armed_at: now,
    last_fired: null,
    snooze_until: null,
  };
  return with_clock((data) => {
    data.alarms.push(alarm);
    return alarm_value(alarm, now);
  });
}

function find_alarm(data: ClockData, query: string): Alarm {
  const found = find_entry(data.alarms, query, "alarm");
  if (typeof found === "string") throw new ShellError(found);
  return found;
}

export function alarm_switch({ args }: CommandContext<{ alarm: string }>, enabled: boolean): Promise<Tagged> {
  return with_clock((data) => {
    const alarm = find_alarm(data, args.alarm);
    alarm.enabled = enabled;
    alarm.snooze_until = null;
    if (enabled) alarm.armed_at = Date.now();
    return alarm_value(alarm, Date.now());
  });
}

export function alarm_rm({ args }: CommandContext<{ alarm: string }>): Promise<string> {
  return with_clock((data) => {
    const alarm = find_alarm(data, args.alarm);
    data.alarms = data.alarms.filter((entry) => entry.id !== alarm.id);
    return `removed the ${alarm.time} alarm${alarm.label ? ` (${alarm.label})` : ""}`;
  });
}

export function timer_start({ args }: CommandContext<{ duration: string; label: string[] }>): Promise<Tagged> {
  const ms = parse_duration(args.duration);
  if (!ms) throw new ShellError(`timer: "${args.duration}" isn't a duration like 5m, 1h30m or 90s`);
  const now = Date.now();
  const timer = start_timer(
    { id: new_id(), label: args.label.join(" ").trim(), duration_ms: ms, end_at: null, remaining_ms: ms },
    now
  );
  return with_clock((data) => {
    data.timers.push(timer);
    return timer_value(timer, now);
  });
}

export async function* timers(): AsyncGenerator<Tagged> {
  const now = Date.now();
  const data = await clock_file.read();
  ring_if_timers(data);
  yield* data.timers.map((timer) => timer_value(timer, now));
}

export function timer_stop({ args }: CommandContext<{ timer: string }>): Promise<string> {
  return with_clock((data) => {
    const found = find_entry(data.timers, args.timer, "timer");
    if (typeof found === "string") throw new ShellError(found);
    data.timers = data.timers.filter((entry) => entry.id !== found.id);
    return `stopped ${found.label || format_duration(found.duration_ms)}`;
  });
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
