import kernel, { type FilesService } from "$lib/core/api";
import { day_key } from "$lib/core/games/time";
import { createSubscriber } from "svelte/reactivity";
import { BOARDS_PATH, count_due } from "./data";
import { read_boards } from "./store";

const DIRECTORY = BOARDS_PATH.slice(0, BOARDS_PATH.lastIndexOf("/"));

let due = $state<number | null>(null);
let today = $state(day_key());

/** Runs only while an icon shows the badge; the minute tick moves "today" past midnight. */
const subscribe = createSubscriber(() =>
  $effect.root(() => {
    $effect(() => {
      const timer = setInterval(() => (today = day_key()), 60_000);
      return () => clearInterval(timer);
    });
    $effect(() => {
      const files = kernel.service<FilesService>("files");
      const day = today;
      files.revision(DIRECTORY);
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
