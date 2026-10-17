import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { Tagged } from "$lib/core/api/services/shell/type";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

const hours_minutes = (row: Tagged) =>
  `${Math.floor(Number(row.minutes) / 60)}:${String(Number(row.minutes) % 60).padStart(2, "0")}`;

const month_arg = () => z.string().optional().describe("YYYY-MM, a month number, last or next; this month by default");

export default {
  values: {
    workday: {
      columns: ["day", "in", "out", "hours", "work"],
      text: (row) => `${row.day}  ${row.in}–${row.out}  ${hours_minutes(row).padStart(6)}  ${row.work}`,
      cell: (row, column) => (column === "hours" ? hours_minutes(row) : String(row[column] ?? "")),
      open: (row) => void logic().then((m) => m.open_day(String(row.day))),
    },
  },
  commands: [
    define_command({
      id: "wh in",
      description: "Clock in, with what you're working on",
      args: z.object({ description: z.array(z.string()).default([]).describe("What you're working on") }),
      positional: ["description"],
      run: async (context) => (await logic()).clock_on(context),
    }),
    define_command({
      id: "wh out",
      description: "Clock out and book the session",
      yields: "workday",
      async *run() {
        yield* (await logic()).clock_off();
      },
    }),
    define_command({
      id: "wh status",
      description: "Whether you're clocked in, and today's and this month's hours",
      run: async () => (await logic()).status(),
    }),
    define_command({
      id: "wh ls",
      description: "Days worked in a month",
      args: z.object({ month: month_arg() }),
      positional: ["month"],
      yields: "workday",
      async *run(context) {
        yield* (await logic()).list(context);
      },
    }),
    define_command({
      id: "wh add",
      description: "Book time on a day: wh add yesterday 9:00 12:30 Review",
      args: z.object({
        date: z.string().describe("YYYY-MM-DD, today, yesterday, -N or a day of this month"),
        start: z.string().describe("HH:MM"),
        end: z.string().describe("HH:MM"),
        description: z.array(z.string()).default([]),
      }),
      positional: ["date", "start", "end", "description"],
      yields: "workday",
      run: async (context) => (await logic()).add(context),
    }),
    define_command({
      id: "wh report",
      description: "Print a month's time sheet",
      args: z.object({ month: month_arg() }),
      positional: ["month"],
      run: async (context) => (await logic()).report(context),
    }),
    define_command({
      id: "wh target",
      description: "Set a month's target hours, or none",
      args: z.object({ hours: z.string().describe("Hours, or none"), month: month_arg() }),
      positional: ["hours", "month"],
      run: async (context) => (await logic()).target(context),
    }),
  ],
} satisfies ShellContribution;
