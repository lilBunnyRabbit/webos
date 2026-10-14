import kernel, { type FilesService } from "$lib/core/api";
import { createSubscriber } from "svelte/reactivity";
import { NOTES_DIR, parse_todos } from "./notes";
import { read_todo } from "./store";

let open = $state<number | null>(null);

/** Starts when the first icon reads the badge and stops with the last one, so nothing runs while no icon is on screen. */
const subscribe = createSubscriber(() =>
  $effect.root(() => {
    $effect(() => {
      const files = kernel.service<FilesService>("files");
      files.revision(NOTES_DIR);
      void read_todo(files).then((text) => (open = parse_todos(text).filter((todo) => !todo.done).length));
    });
  })
);

export function open_todos(): number | null {
  subscribe();
  return open;
}
