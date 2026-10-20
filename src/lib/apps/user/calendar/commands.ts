import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const day_arg = () => z.string().describe("YYYY-MM-DD, today, tomorrow, +N or a day of this month");

export default {
  values: {
    event: {
      columns: ["time", "title", "repeat", "day"],
      text: (event) => `${event.day}  ${String(event.time).padEnd(11)} ${event.title}`,
      open: (event) => void logic().then((m) => m.open_day(String(event.day))),
    },
  },
  commands: [
    define_command({
      id: "cal",
      ai: "read",
      description: "Calendar events on one day, today by default",
      args: z.object({ day: day_arg().optional() }),
      positional: ["day"],
      yields: "event",
      async *run(context) {
        yield* (await logic()).on_day(context);
      },
    }),
    define_command({
      id: "cal add",
      description: "Add an event: cal add Dentist --day tomorrow --at 14:30 --remind 1h; no --at makes it all day",
      args: z.object({
        title: z.array(z.string()).default([]).describe("The event's title"),
        day: day_arg(),
        at: z.string().optional().describe("Start, HH:MM"),
        until: z.string().optional().describe("End, HH:MM; an hour after --at by default"),
        repeat: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
        remind: z.string().optional().describe("Before the start: minutes, 1h, 1d"),
      }),
      positional: ["title"],
      yields: "event",
      run: async (context) => (await logic()).add(context),
    }),
    define_command({
      id: "cal agenda",
      ai: "read",
      description: "Calendar events from today on: the next 7 days, or --days N",
      args: z.object({ days: z.number().int().min(1).max(366).default(7) }),
      yields: "event",
      async *run(context) {
        yield* (await logic()).agenda(context);
      },
    }),
    define_command({
      id: "cal open",
      description: "Open Calendar on a day",
      args: z.object({ date: day_arg().optional() }),
      positional: ["date"],
      run: async (context) => (await logic()).open(context),
    }),
  ],
} satisfies ShellContribution;
