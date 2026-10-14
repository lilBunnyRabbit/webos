import { detached_root } from "$lib/core/utils/detached-root.svelte";
import kernel, { type FilesService } from "$lib/core/api";
import { createSubscriber } from "svelte/reactivity";
import { parent_path } from "$lib/core/api/services/files/path";
import { day_key } from "$lib/core/utils/date";

interface Logic {
  BOARDS_PATH: string;
  count_due: typeof import("./data").count_due;
  read_boards: typeof import("./store").read_boards;
}

let due = $state<number | null>(null);
let today = $state(day_key());
// Manifests load at boot; the board logic waits until an icon shows the badge.
let logic = $state.raw<Logic | null>(null);

/** Runs only while an icon shows the badge; the minute tick moves "today" past midnight. */
const subscribe = createSubscriber(() =>
  detached_root(() => {
    if (!logic)
      void Promise.all([import("./data"), import("./store")]).then(([data, store]) => (logic = { ...data, ...store }));
    $effect(() => {
      const timer = setInterval(() => (today = day_key()), 60_000);
      return () => clearInterval(timer);
    });
    $effect(() => {
      if (!logic) return;
      const { BOARDS_PATH, count_due, read_boards } = logic;
      const files = kernel.service<FilesService>("files");
      const day = today;
      files.revision(parent_path(BOARDS_PATH));
      void read_boards(files).then((file) => {
        if (file) due = count_due(file, day);
      });
    });
  })
);

export function due_badge(): number | null {
  subscribe();
  return due;
}
