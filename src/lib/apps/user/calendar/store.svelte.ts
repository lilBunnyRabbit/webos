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
import { untrack } from "svelte";
import { EMPTY_EVENTS, EVENTS_PATH, EventsFileSchema, month_of, type EventsFile } from "./calendar";

export function open_events(): JsonFile<EventsFile> {
  return json_file(EVENTS_PATH, EMPTY_EVENTS, EventsFileSchema);
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
