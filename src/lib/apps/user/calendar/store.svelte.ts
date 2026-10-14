import kernel, { type AppsService, type NotificationsService } from "$lib/core/api";
import { json_file, type JsonFile } from "$lib/core/contexts/app";
import {
  BOARDS_PATH,
  default_file,
  due_cards,
  KanbanFileSchema,
  type DueCard,
  type KanbanFile,
} from "$lib/apps/user/kanban/data";
import {
  empty_month,
  month_file_path,
  MonthFileSchema,
  type Day,
  type MonthFile,
} from "$lib/apps/user/work-hours/data";
import { CalendarDots as CalendarDotsIcon } from "phosphor-svelte";
import { untrack } from "svelte";
import {
  APP_ID,
  due_reminder,
  EMPTY_EVENTS,
  EVENTS_PATH,
  EventsFileSchema,
  format_day,
  month_of,
  time_label,
  until_label,
  type EventsFile,
} from "./calendar";
import { day_key } from "$lib/core/utils/date";

export interface EventsHandle {
  value: EventsFile;
  readonly ready: boolean;
  readonly error: string | null;
}

export function open_events(): JsonFile<EventsFile> {
  return json_file(EVENTS_PATH, EMPTY_EVENTS, EventsFileSchema);
}

function notify_due(data: EventsFile, now: number): void {
  data.events.forEach((event, index) => {
    const due = due_reminder(event, now);
    if (!due) return;
    const snapshot = $state.snapshot(event);
    data.events[index] = { ...snapshot, last_notified: due.occurrence.start };
    const { day, start } = due.occurrence;
    const when = !snapshot.all_day
      ? until_label(start - now)
      : day === day_key(new Date(now))
        ? "today"
        : format_day(day, { weekday: "long", month: "short", day: "numeric" });
    kernel.service<NotificationsService>("notifications").notify(APP_ID, {
      title: snapshot.title,
      message: `${time_label(snapshot)} · ${when}`,
      icon: CalendarDotsIcon,
      system: true,
      duration: null,
      actions: [{ label: "Open", on_click: () => kernel.service<AppsService>("apps").launch(APP_ID, { day }) }],
    });
  });
}

/**
 * Checks reminders while the calling component lives, visible or not; windows and the widget both host it. They share
 * one data cell, so whoever checks first stores `last_notified` and the others see it. Call during component init.
 */
export function remind_while_alive(file: EventsHandle): void {
  $effect(() => {
    if (!file.ready) return;
    const check = () => untrack(() => notify_due(file.value, Date.now()));
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  });
}

export class WorkHoursSource {
  private files = $state.raw<Record<string, JsonFile<MonthFile>>>({});

  constructor(months: () => string[]) {
    $effect(() => {
      const wanted = months();
      untrack(() => this.sync(wanted));
    });
    $effect(() => () => this.sync([]));
  }

  /** Opens the new months before letting go of the old ones, so a shared month never drops to zero holders and re-reads. */
  private sync(wanted: string[]): void {
    const next: Record<string, JsonFile<MonthFile>> = {};
    for (const month of wanted)
      next[month] = this.files[month] ?? json_file(month_file_path(month), empty_month(month), MonthFileSchema);
    for (const [month, file] of Object.entries(this.files)) if (!(month in next)) file.release();
    this.files = next;
  }

  day(day: string): Day | undefined {
    const file = this.files[month_of(day)];
    return file?.ready ? file.value.days[day] : undefined;
  }
}

export class KanbanSource {
  private file = $state.raw<JsonFile<KanbanFile> | null>(null);

  constructor(active: () => boolean) {
    $effect(() => {
      if (!active()) return;
      const handle = json_file(BOARDS_PATH, default_file(), KanbanFileSchema);
      this.file = handle;
      return () => {
        handle.release();
        this.file = null;
      };
    });
  }

  readonly by_day = $derived.by(() => {
    const groups = new Map<string, DueCard[]>();
    if (!this.file?.ready) return groups;
    for (const entry of due_cards(this.file.value)) {
      const day = entry.card.due!;
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    }
    return groups;
  });

  on(day: string): DueCard[] {
    return this.by_day.get(day) ?? [];
  }
}
