import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { CalendarDots as CalendarDotsIcon } from "phosphor-svelte";
import { today_badge } from "./badge.svelte";
import { CALENDAR_PROPS } from "./calendar";

export default define_app({
  id: "calendar",
  name: "Calendar",
  icon: CalendarDotsIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Your events by month, week or agenda, with reminders, worked hours and due cards.",
  keywords: ["calendar", "events", "schedule", "agenda", "reminder", "appointment", "date"],
  props: CALENDAR_PROPS,
  badge: today_badge,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  widget: () => import("./widget.svelte"),
  component: () => import("./calendar.app.svelte"),
});
