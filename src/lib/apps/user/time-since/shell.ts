import kernel, { type AppsService, type DesktopItem, type DesktopService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { app_data_path } from "$lib/core/contexts/app/json-file.svelte";
import { live_file } from "$lib/core/contexts/app/live-file.svelte";
import { format_datetime } from "$lib/core/utils";
import {
  APP_ID,
  COUNTERS_FILE,
  CounterSort,
  CountersFileSchema,
  create_counter,
  EMPTY_FILE,
  elapsed_of,
  format_live,
  reset,
  resolve_counter,
  sort_counters,
  start,
  stop,
  update_counter,
  type Counter,
  type CountersFile,
} from "./counters";

const ID_LENGTH = 8;

const counters_file = live_file<CountersFile>(app_data_path(APP_ID, COUNTERS_FILE), EMPTY_FILE, CountersFileSchema);
const read_counters = async () => (await counters_file.read()).counters;

export function counter_value(counter: Counter, now: number): Tagged {
  const running = counter.current_start !== null;
  return {
    $type: "counter",
    id: counter.id.slice(0, ID_LENGTH),
    name: counter.name,
    elapsed: running ? format_live(elapsed_of(counter, now)) : "stopped",
    since: running ? format_datetime(counter.current_start ?? now) : "",
    runs: counter.runs.length,
  };
}

function find(counters: Counter[], query: string): Counter {
  const found = resolve_counter(counters, query);
  if (typeof found === "string") throw new ShellError(found);
  return found;
}

export async function* list(): AsyncGenerator<Tagged> {
  const now = Date.now();
  yield* sort_counters(await read_counters(), CounterSort.LONGEST).map((counter) => counter_value(counter, now));
}

export async function create({ args }: CommandContext<{ name: string[] }>): Promise<Tagged> {
  const name = args.name.join(" ").trim();
  if (!name) throw new ShellError("since new: name the counter, like since new Last coffee");
  const counter = create_counter(name, Date.now(), crypto.randomUUID());
  await counters_file.edit((file) => ({ ...file, counters: [...file.counters, counter] }));
  return counter_value(counter, Date.now());
}

export async function change(
  { args }: CommandContext<{ counter: string }>,
  update: (counter: Counter, now: number) => Counter
): Promise<Tagged> {
  const { id } = find(await read_counters(), args.counter);
  const now = Date.now();
  const next = await counters_file.edit((file) => update_counter(file, id, (counter) => update(counter, now)));
  return counter_value(
    next.counters.find((counter) => counter.id === id)!,
    now
  );
}

export const reset_counter = (context: CommandContext<{ counter: string }>) => change(context, reset);
export const stop_counter = (context: CommandContext<{ counter: string }>) => change(context, stop);
export const start_counter = (context: CommandContext<{ counter: string }>) => change(context, start);

function widget_for(id: string) {
  return kernel
    .service<DesktopService>("desktop")
    .items()
    .find(
      (item): item is Extract<DesktopItem, { kind: "widget" }> =>
        item.kind === "widget" && item.app_id === APP_ID && item.props?.counter === id
    );
}

export async function remove({ args }: CommandContext<{ counter: string }>): Promise<string> {
  const counter = find(await read_counters(), args.counter);
  await counters_file.edit((file) => ({ ...file, counters: file.counters.filter((entry) => entry.id !== counter.id) }));
  const widget = widget_for(counter.id);
  if (widget)
    await kernel
      .service<DesktopService>("desktop")
      .remove_item(widget.name)
      .catch(() => {});
  return `removed ${counter.name}`;
}

export async function pin({ args }: CommandContext<{ counter: string }>): Promise<string> {
  const counter = find(await read_counters(), args.counter);
  if (widget_for(counter.id)) return `${counter.name} is already on the desktop`;
  const name = await kernel
    .service<DesktopService>("desktop")
    .pin_widget(APP_ID, { label: counter.name, props: { counter: counter.id } });
  if (!name) throw new ShellError("since pin: couldn't pin the counter");
  return `pinned ${name} to the desktop`;
}

export async function open(query: string): Promise<void> {
  const counter = find(await read_counters(), query);
  kernel.service<AppsService>("apps").launch(APP_ID, { counter: counter.id });
}

export async function complete(partial: string) {
  const query = partial.toLowerCase();
  const now = Date.now();
  return sort_counters(await read_counters(), CounterSort.LONGEST)
    .filter((counter) => counter.id.startsWith(query) || counter.name.toLowerCase().includes(query))
    .map((counter) => ({
      value: counter.id.slice(0, ID_LENGTH),
      detail: `${counter.name} · ${counter_value(counter, now).elapsed}`,
    }));
}
