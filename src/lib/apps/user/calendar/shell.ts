import kernel, { type AppsService } from "$lib/core/api";
import type { CommandContext, Tagged } from "$lib/core/api/services/shell/type";
import {
  add_days,
  APP_ID,
  expand,
  format_day,
  time_label,
  type Occurrence,
} from "./calendar";
import { day_arg, event_from_args, type AddArgs } from "./parse";
import { day_key } from "$lib/core/utils/date";
import { events_file, sync_reminder } from "./jobs";

export function event_value({ event, day }: Pick<Occurrence, "event" | "day">): Tagged {
  return {
    $type: "event",
    id: event.id,
    time: time_label(event),
    title: event.title,
    repeat: event.repeat?.every ?? "",
    day,
  };
}

export function open_day(day?: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, day ? { day } : {});
}

function* listed(found: Occurrence[], empty: string): Generator<Tagged | string> {
  if (!found.length) yield empty;
  for (const occurrence of found) yield event_value(occurrence);
}

export async function* on_day({ args }: CommandContext<{ day?: string }>): AsyncGenerator<Tagged | string> {
  const day = day_arg(args.day, "cal", day_key(new Date()));
  yield* listed(
    expand((await events_file.read()).events, day, day),
    `nothing on ${format_day(day, { weekday: "long", month: "short", day: "numeric" })}`
  );
}

export async function* agenda({ args }: CommandContext<{ days: number }>): AsyncGenerator<Tagged | string> {
  const today = day_key(new Date());
  yield* listed(
    expand((await events_file.read()).events, today, add_days(today, args.days - 1)),
    `nothing in the next ${args.days === 1 ? "day" : `${args.days} days`}`
  );
}

export async function add({ args }: CommandContext<AddArgs>): Promise<Tagged> {
  const event = event_from_args(args, day_key(new Date()));
  await events_file.edit((file) => ({ ...file, events: [...file.events, event] }));
  await sync_reminder(event);
  return event_value({ event, day: event.day });
}

export function open({ args }: CommandContext<{ date?: string }>): void {
  open_day(args.date === undefined ? undefined : day_arg(args.date, "cal open", day_key(new Date())));
}
