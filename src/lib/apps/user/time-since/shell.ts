import kernel, { type AppsService, type DesktopItem, type DesktopService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { app_data_path, json_file } from "$lib/core/contexts/app/json-file.svelte";
import { format_datetime } from "$lib/core/utils";
import {
  APP_ID,
  COUNTERS_FILE,
  CounterSort,
  CountersFileSchema,
  create_counter,
  EMPTY_FILE,
  elapsed_of,
  format_duration,
  reset,
  resolve_counter,
  sort_counters,
  start,
  stop,
  update_counter,
  type Counter,
  type CountersFile,
} from "./counters";

const READY_TIMEOUT = 5000;
const ID_LENGTH = 8;

async function with_file<T>(action: (file: { value: CountersFile }) => T): Promise<T> {
  const file = json_file(app_data_path(APP_ID, COUNTERS_FILE), EMPTY_FILE, CountersFileSchema);
  try {
    for (let waited = 0; !file.ready; waited += 25) {
      if (waited >= READY_TIMEOUT) throw new ShellError("since: the counters didn't load");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return action(file);
  } finally {
    file.release();
  }
}

export function counter_value(counter: Counter, now: number): Tagged {
  const running = counter.current_start !== null;
  return {
    $type: "counter",
    id: counter.id.slice(0, ID_LENGTH),
    name: counter.name,
    elapsed: running ? format_duration(elapsed_of(counter, now)) : "stopped",
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
  yield* await with_file((file) => sort_counters(file.value.counters, CounterSort.LONGEST).map((counter) => counter_value(counter, now)));
}

export function create({ args }: CommandContext<{ name: string[] }>): Promise<Tagged> {
  const name = args.name.join(" ").trim();
  if (!name) throw new ShellError("since new: name the counter, like since new Last coffee");
  return with_file((file) => {
    const counter = create_counter(name, Date.now(), crypto.randomUUID());
    file.value = { ...file.value, counters: [...file.value.counters, counter] };
    return counter_value(counter, Date.now());
  });
}

export function change({ args }: CommandContext<{ counter: string }>, update: (counter: Counter, now: number) => Counter): Promise<Tagged> {
  return with_file((file) => {
    const { id } = find(file.value.counters, args.counter);
    const now = Date.now();
    file.value = update_counter(file.value, id, (counter) => update(counter, now));
    return counter_value(file.value.counters.find((counter) => counter.id === id)!, now);
  });
}

export const reset_counter = (context: CommandContext<{ counter: string }>) => change(context, reset);
export const stop_counter = (context: CommandContext<{ counter: string }>) => change(context, stop);
export const start_counter = (context: CommandContext<{ counter: string }>) => change(context, start);

function widget_for(id: string) {
  return kernel
    .service<DesktopService>("desktop")
    .items()
    .find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === APP_ID && item.props?.counter === id);
}

export async function remove({ args }: CommandContext<{ counter: string }>): Promise<string> {
  const counter = await with_file((file) => {
    const found = find(file.value.counters, args.counter);
    file.value = { ...file.value, counters: file.value.counters.filter((entry) => entry.id !== found.id) };
    return found;
  });
  const widget = widget_for(counter.id);
  if (widget) await kernel.service<DesktopService>("desktop").remove_item(widget.name).catch(() => {});
  return `removed ${counter.name}`;
}

export async function pin({ args }: CommandContext<{ counter: string }>): Promise<string> {
  const counter = await with_file((file) => find(file.value.counters, args.counter));
  if (widget_for(counter.id)) return `${counter.name} is already on the desktop`;
  const name = await kernel.service<DesktopService>("desktop").pin_widget(APP_ID, { label: counter.name, props: { counter: counter.id } });
  if (!name) throw new ShellError("since pin: couldn't pin the counter");
  return `pinned ${name} to the desktop`;
}

export async function open(query: string): Promise<void> {
  const counter = await with_file((file) => find(file.value.counters, query));
  kernel.service<AppsService>("apps").launch(APP_ID, { counter: counter.id });
}

export async function complete(partial: string) {
  const query = partial.toLowerCase();
  const now = Date.now();
  return with_file((file) =>
    sort_counters(file.value.counters, CounterSort.LONGEST)
      .filter((counter) => counter.id.startsWith(query) || counter.name.toLowerCase().includes(query))
      .map((counter) => ({ value: counter.id.slice(0, ID_LENGTH), detail: `${counter.name} · ${counter_value(counter, now).elapsed}` }))
  );
}
