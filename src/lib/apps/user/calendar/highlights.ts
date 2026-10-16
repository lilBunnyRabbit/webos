import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Bell as BellIcon, ClockUser as ClockUserIcon, Kanban as KanbanIcon, Rows as RowsIcon } from "phosphor-svelte";

export default [
  { icon: RowsIcon, title: "Three views", text: "See your events by month, by week or as an agenda." },
  { icon: BellIcon, title: "Reminders", text: "Repeat events daily, weekly, monthly or yearly, and get a reminder before they start." },
  { icon: KanbanIcon, title: "Due cards", text: "Kanban cards with a due date land on their day." },
  { icon: ClockUserIcon, title: "Worked hours", text: "Show the hours you logged next to each day." },
] satisfies AppHighlight[];
