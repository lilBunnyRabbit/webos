import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { ClockCounterClockwise as ClockCounterClockwiseIcon } from "phosphor-svelte";

const logic = () => import("./shell");
const counter_args = z.object({ counter: arg.kind("counter").describe("Name or id") });

export const TIME_SINCE_PROPS = z.object({ counter: z.string().optional() });

export default define_app({
  id: "time-since",
  name: "Time Since",
  icon: ClockCounterClockwiseIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Count up from the last time something happened, and see how long each run lasted.",
  keywords: ["counter", "count up", "streak", "since", "habit", "quit", "sober", "timer", "days", "last time"],
  props: TIME_SINCE_PROPS,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 360 },
    },
  },
  shell: {
    completers: {
      counter: async (partial) => (await logic()).complete(partial),
    },
    values: {
      counter: {
        columns: ["id", "name", "elapsed", "since", "runs"],
        text: (counter) => `${counter.name}  ${counter.elapsed}`,
        open: (counter) => void logic().then((m) => m.open(String(counter.id))),
      },
    },
    commands: [
      define_command({
        id: "since",
        description: "Counters, longest running first",
        yields: "counter",
        async *run() {
          yield* (await logic()).list();
        },
      }),
      define_command({
        id: "since new",
        description: "Start a new counter from now",
        args: z.object({ name: z.array(z.string()).default([]).describe("Like Last coffee") }),
        positional: ["name"],
        yields: "counter",
        run: async (context) => (await logic()).create(context),
      }),
      define_command({
        id: "since reset",
        description: "End the current run and count again from zero",
        args: counter_args,
        positional: ["counter"],
        yields: "counter",
        run: async (context) => (await logic()).reset_counter(context),
      }),
      define_command({
        id: "since stop",
        description: "End the current run and wait",
        args: counter_args,
        positional: ["counter"],
        yields: "counter",
        run: async (context) => (await logic()).stop_counter(context),
      }),
      define_command({
        id: "since start",
        description: "Start a stopped counter",
        args: counter_args,
        positional: ["counter"],
        yields: "counter",
        run: async (context) => (await logic()).start_counter(context),
      }),
      define_command({
        id: "since rm",
        description: "Delete a counter and its history",
        args: counter_args,
        positional: ["counter"],
        run: async (context) => (await logic()).remove(context),
      }),
      define_command({
        id: "since pin",
        description: "Pin a counter to the desktop",
        args: counter_args,
        positional: ["counter"],
        run: async (context) => (await logic()).pin(context),
      }),
    ],
  },
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 1 }, max: { w: 5, h: 3 }, default: { w: 3, h: 1 } },
  component: () => import("./time-since.app.svelte"),
});
