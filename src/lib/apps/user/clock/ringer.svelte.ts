import kernel, { NotificationType, type NotificationsService } from "$lib/core/api";
import { app_data_path, json_file, live_file, type JsonFile } from "$lib/core/contexts/app";
import { Alarm as AlarmIcon, Timer as TimerIcon } from "phosphor-svelte";
import { untrack } from "svelte";
import { play_chime } from "./chime";
import {
  after_fire,
  AlarmPlan,
  APP_ID,
  check_alarm,
  ClockDataSchema,
  DATA_FILE,
  EMPTY_CLOCK,
  finish_timer,
  format_duration,
  format_hm,
  is_timer_due,
  repeat_label,
  SNOOZE_MS,
  start_timer,
  type Alarm,
  type ClockData,
  type Timer,
} from "./clock";

export type ClockFile = Omit<JsonFile<ClockData>, "release">;

const notifications = () => kernel.service<NotificationsService>("notifications");

/** For code with no app context (the widget). Release it when done. */
export function open_clock_file(): JsonFile<ClockData> {
  return json_file(app_data_path(APP_ID, DATA_FILE), EMPTY_CLOCK, ClockDataSchema);
}

/** For code that reads or changes the data once (shell commands, toast actions). */
export const clock_file = live_file(app_data_path(APP_ID, DATA_FILE), EMPTY_CLOCK, ClockDataSchema);

function edit_clock(change: (data: ClockData) => void): void {
  void clock_file
    .edit((data) => {
      change(data);
      return data;
    })
    .catch((error) => console.warn("[Clock] Couldn't change the data:", error));
}

function ring_alarm(alarm: Alarm): void {
  play_chime();
  notifications().notify(APP_ID, {
    title: alarm.label || "Alarm",
    message: `${alarm.time} · ${repeat_label(alarm.days)}`,
    icon: AlarmIcon,
    system: true,
    duration: null,
    actions: [
      { label: "Stop", on_click: () => {} },
      {
        label: "Snooze 10 min",
        on_click: () =>
          edit_clock((data) => {
            const target = data.alarms.find((entry) => entry.id === alarm.id);
            if (target) target.snooze_until = Date.now() + SNOOZE_MS;
          }),
      },
    ],
  });
}

function report_missed(alarm: Alarm, at: number): void {
  notifications().notify(APP_ID, {
    type: NotificationType.WARNING,
    title: `Missed alarm${alarm.label ? `: ${alarm.label}` : ""}`,
    message: `It was set for ${format_hm(at)} while WebOS was closed.`,
    icon: AlarmIcon,
  });
}

function ring_timer(timer: Timer): void {
  play_chime();
  notifications().notify(APP_ID, {
    title: `${timer.label || "Timer"} is done`,
    message: format_duration(timer.duration_ms),
    icon: TimerIcon,
    system: true,
    duration: null,
    actions: [
      { label: "Stop", on_click: () => {} },
      {
        label: "Restart",
        on_click: () =>
          edit_clock((data) => {
            const index = data.timers.findIndex((entry) => entry.id === timer.id);
            if (index >= 0) data.timers[index] = start_timer(data.timers[index], Date.now());
          }),
      },
    ],
  });
}

/**
 * Every window and widget shares one data cell, so whoever checks first stores `last_fired` (or finishes the timer)
 * before the next host looks: one ring per occurrence however many hosts are alive.
 */
export function ring_due(data: ClockData, now: number): void {
  data.alarms.forEach((alarm, index) => {
    const check = check_alarm(alarm, now);
    if (check.plan === AlarmPlan.NONE || check.at === null) return;
    const snapshot = $state.snapshot(alarm);
    data.alarms[index] = after_fire(snapshot, check);
    if (check.plan === AlarmPlan.RING) ring_alarm(snapshot);
    else report_missed(snapshot, check.at);
  });
  data.timers.forEach((timer, index) => {
    if (!is_timer_due(timer, now)) return;
    const snapshot = $state.snapshot(timer);
    data.timers[index] = finish_timer(snapshot);
    ring_timer(snapshot);
  });
}

let hosting = false;

/** A timer started from the shell with no window or widget open would have nobody to ring it. */
export function ring_while_timers(): void {
  if (hosting) return;
  hosting = true;
  const file = open_clock_file();
  const stop = $effect.root(() => {
    $effect(() => {
      if (!file.ready) return;
      if (!file.value.timers.some((timer) => timer.end_at !== null)) {
        queueMicrotask(() => {
          stop();
          file.release();
          hosting = false;
        });
        return;
      }
      const check = () => untrack(() => ring_due(file.value, Date.now()));
      check();
      const timer = setInterval(check, 1000);
      return () => clearInterval(timer);
    });
  });
}

/**
 * Checks every second while the calling component lives, visible or not: windows and the desktop widget both host
 * it, so alarms keep working with either one alive. Call during component init.
 */
export function ring_while_alive(file: ClockFile): void {
  $effect(() => {
    if (!file.ready) return;
    const check = () => untrack(() => ring_due(file.value, Date.now()));
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  });
}
