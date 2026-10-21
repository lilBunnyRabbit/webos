import { z } from "zod";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { ClockFace, ClockTab } from "./props";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  completers: {
    zone: async (partial) => (await logic()).complete_zones(partial),
  },
  values: {
    alarm: {
      columns: ["id", "time", "repeat", "label", "on", "next"],
      text: (alarm) =>
        `${alarm.id}  ${alarm.time}  ${alarm.on ? "on " : "off"}  ${alarm.repeat}${alarm.label ? `  ${alarm.label}` : ""}`,
      cell: (alarm, column) => (column === "on" ? (alarm.on ? "on" : "off") : String(alarm[column] ?? "")),
      open: () => void logic().then((m) => m.open_alarms()),
    },
    timer: {
      columns: ["id", "label", "left", "duration", "state"],
      text: (timer) =>
        `${timer.id}  ${String(timer.left).padStart(7)}  ${timer.state}  ${timer.label || timer.duration}`,
      open: () => void logic().then((m) => m.open_timers()),
    },
  },
  commands: [
    define_command({
      id: "clock",
      description: "Open Clock, optionally on a tab",
      args: z.object({ tab: z.enum(ClockTab).optional() }),
      positional: ["tab"],
      run: async (context) => (await logic()).open_app(context),
    }),
    define_command({
      id: "clock pin",
      description: "Pin a clock to the desktop",
      args: z.object({ face: z.enum(ClockFace).default(ClockFace.ANALOG) }),
      short: { face: "f" },
      run: async (context) => (await logic()).pin(context),
    }),
    define_command({
      id: "time",
      description: "The time here, or in a time zone",
      args: z.object({ zone: arg.kind("zone").optional().describe("A zone or city, like Tokyo") }),
      positional: ["zone"],
      run: async (context) => (await logic()).time(context),
    }),
    define_command({
      id: "alarm ls",
      description: "Alarms by time",
      yields: "alarm",
      async *run() {
        yield* (await logic()).alarms();
      },
    }),
    define_command({
      id: "alarm add",
      description: "Set an alarm: once, or -d mon,wed, weekdays or weekends",
      args: z.object({
        time: z.string().describe("HH:MM"),
        days: z.string().optional().describe("mon,wed, weekdays, weekends or daily"),
        label: z.array(z.string()).default([]),
      }),
      positional: ["time", "label"],
      short: { days: "d" },
      yields: "alarm",
      run: async (context) => (await logic()).alarm_add(context),
    }),
    define_command({
      id: "alarm on",
      description: "Switch an alarm on",
      args: z.object({ alarm: z.string().describe("Id or label") }),
      positional: ["alarm"],
      yields: "alarm",
      run: async (context) => (await logic()).alarm_switch(context, true),
    }),
    define_command({
      id: "alarm off",
      description: "Switch an alarm off",
      args: z.object({ alarm: z.string().describe("Id or label") }),
      positional: ["alarm"],
      yields: "alarm",
      run: async (context) => (await logic()).alarm_switch(context, false),
    }),
    define_command({
      id: "alarm snooze",
      description: "Ring an alarm again in a while, 10 minutes unless given",
      args: z.object({ alarm: z.string().describe("Id or label"), duration: z.string().default("10m").describe("10m, 1h, 90s") }),
      positional: ["alarm", "duration"],
      yields: "alarm",
      run: async (context) => (await logic()).alarm_snooze(context),
    }),
    define_command({
      id: "alarm stop",
      description: "Stop a ringing or snoozed alarm; a one-off one switches off",
      args: z.object({ alarm: z.string().describe("Id or label") }),
      positional: ["alarm"],
      yields: "alarm",
      run: async (context) => (await logic()).alarm_stop(context),
    }),
    define_command({
      id: "alarm rm",
      description: "Delete an alarm",
      args: z.object({ alarm: z.string().describe("Id or label") }),
      positional: ["alarm"],
      run: async (context) => (await logic()).alarm_rm(context),
    }),
    define_command({
      id: "timer",
      description: "Start a timer, like timer 5m tea or timer 1h30m",
      args: z.object({ duration: z.string().describe("5m, 1h30m, 90s"), label: z.array(z.string()).default([]) }),
      positional: ["duration", "label"],
      yields: "timer",
      run: async (context) => (await logic()).timer_start(context),
    }),
    define_command({
      id: "timer ls",
      description: "Timers and the time left",
      yields: "timer",
      async *run() {
        yield* (await logic()).timers();
      },
    }),
    define_command({
      id: "timer restart",
      description: "Start a timer again from its full length",
      args: z.object({ timer: z.string().describe("Id or label") }),
      positional: ["timer"],
      yields: "timer",
      run: async (context) => (await logic()).timer_restart(context),
    }),
    define_command({
      id: "timer stop",
      description: "Stop and remove a timer",
      args: z.object({ timer: z.string().describe("Id or label") }),
      positional: ["timer"],
      run: async (context) => (await logic()).timer_stop(context),
    }),
  ],
} satisfies ShellContribution;
