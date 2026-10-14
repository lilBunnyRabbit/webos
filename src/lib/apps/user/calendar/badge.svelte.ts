import { detached_root } from "$lib/core/utils/detached-root.svelte";
import kernel, { type FilesService } from "$lib/core/api";
import { createSubscriber } from "svelte/reactivity";
import { day_key } from "$lib/core/utils/date";

type Logic = typeof import("./calendar");

let count = $state<number | null>(null);
let today = $state(day_key());
// Manifests load at boot; the recurrence logic waits until an icon shows the badge.
let logic = $state.raw<Logic | null>(null);

/** Runs only while an icon shows the badge; the minute tick moves "today" past midnight. */
const subscribe = createSubscriber(() =>
  detached_root(() => {
    if (!logic) void import("./calendar").then((module) => (logic = module));
    $effect(() => {
      const timer = setInterval(() => (today = day_key()), 60_000);
      return () => clearInterval(timer);
    });
    $effect(() => {
      if (!logic) return;
      const { EVENTS_DIR, EVENTS_PATH, expand, parse_events } = logic;
      const files = kernel.service<FilesService>("files");
      const day = today;
      files.revision(EVENTS_DIR);
      void files
        .get_file(EVENTS_PATH)
        .then((file) => file?.text() ?? null)
        .then((text) => {
          const data = text ? parse_events(text) : null;
          count = data ? expand(data.events, day, day).length : null;
        })
        .catch(() => (count = null));
    });
  })
);

export function today_badge(): number | null {
  subscribe();
  return count || null;
}
