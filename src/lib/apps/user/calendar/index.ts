import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { today_badge } from "./badge.svelte";
import { CALENDAR_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "calendar",
  name: "Calendar",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Your events by month, week or agenda, with reminders, worked hours and due cards.",
  pitch: {
    problem: "Plans, reminders and worked hours end up scattered across apps.",
    solution: "See your events by month, week or agenda, with reminders and due cards in one view.",
  },
  keywords: ["calendar", "events", "schedule", "agenda", "planner", "reminder", "appointment", "date", "month", "week"],
  props: CALENDAR_PROPS,
  badge: today_badge,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 2 }, max: { w: 5, h: 5 }, default: { w: 3, h: 3 } },
  component: () => import("./calendar.app.svelte"),
});
