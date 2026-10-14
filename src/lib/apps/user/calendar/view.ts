import type { DueCard } from "$lib/apps/user/kanban/data";
import type { Day } from "$lib/apps/user/work-hours/data";
import type { Occurrence } from "./calendar";

export interface DaySources {
  events(day: string): Occurrence[];
  due(day: string): DueCard[];
  work(day: string): Day | undefined;
}

export interface CalendarActions {
  open_event(occurrence: Occurrence): void;
  create(day: string, minutes?: number): void;
  show_day(day: string): void;
  open_card(id: string): void;
  open_work(): void;
}
