import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { CalendarDots as CalendarDotsIcon } from "phosphor-svelte";
import { today_badge } from "./badge.svelte";
import { CALENDAR_PROPS } from "./props";

const logic = () => import("./shell");
const day_arg = () => z.string().describe("YYYY-MM-DD, today, tomorrow, +N or a day of this month");

export default define_app({
  id: "calendar",
  name: "Calendar",
  icon: CalendarDotsIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Your events by month, week or agenda, with reminders, worked hours and due cards.",
  keywords: ["calendar", "events", "schedule", "agenda", "planner", "reminder", "appointment", "date", "month", "week"],
  props: CALENDAR_PROPS,
  badge: today_badge,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: {
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
        description: "Events on a day, today by default",
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
        description: "Events from today on, 7 days or --days N",
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
  },
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 2 }, max: { w: 5, h: 5 }, default: { w: 3, h: 3 } },
  component: () => import("./calendar.app.svelte"),
});
