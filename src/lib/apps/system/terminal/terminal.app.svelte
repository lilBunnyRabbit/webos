<script lang="ts">
  import kernel, { EntryStatus, type Run, type SavedEntry, type ShellService, type Value } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { saved_text } from "./blocks";
  import KeyRow from "./key-row.svelte";
  import PromptInput from "./prompt-input.svelte";
  import TerminalEntry from "./terminal-entry.svelte";

  let { cwd: initial_cwd, run: initial_run }: { cwd?: string; run?: string } = $props();

  const { window: win, storage } = get_app_context();
  const shell = $derived(kernel.service<ShellService>("shell"));

  const SCROLLBACK_LIMIT = 100;
  const RUNNING_SAVE_MS = 1000;
  const saved_schema = z.array(
    z.object({
      input: z.string(),
      cwd: z.string(),
      status: z.enum([EntryStatus.RUNNING, EntryStatus.DONE, EntryStatus.FAILED, EntryStatus.ABORTED]),
      error: z.string().nullable(),
      text: z.string(),
    })
  );
  const cwd = storage.window<string | null>("cwd", null, z.string().nullable());
  const scrollback = storage.window<SavedEntry[]>("scrollback", [], saved_schema);
  const started = storage.window("started", false, z.boolean());

  const session = untrack(() => {
    const created = shell.session(cwd.value ?? initial_cwd);
    created.restore(scrollback.value);
    return created;
  });
  untrack(() => void shell.load());

  let current = $state.raw<Run | null>(null);
  let prompt: PromptInput | undefined = $state();
  let ctrl = $state(false);
  const running = $derived(current?.entry.status === EntryStatus.RUNNING);

  function run(line: string): void {
    const handle = session.run(line);
    current = handle;
    void handle.done.then(() => {
      if (current === handle) current = null;
    });
  }

  $effect(() => {
    cwd.value = session.cwd;
    win.set_title(tilde_path(session.cwd));
  });

  /** Saved items keyed by entry, reused while the entry's values are the same array. */
  const saved = new Map<number, { values: Value[]; item: SavedEntry }>();
  /** A running entry's output is saved on this tick, not on every streamed batch. */
  let save_tick = $state(0);
  $effect(() => {
    if (!running) return;
    const timer = setInterval(() => save_tick++, RUNNING_SAVE_MS);
    return () => clearInterval(timer);
  });
  $effect(() => {
    void save_tick;
    const entries = session.entries.slice(-SCROLLBACK_LIMIT);
    const ids = new Set(entries.map((entry) => entry.id));
    for (const id of saved.keys()) if (!ids.has(id)) saved.delete(id);
    scrollback.value = entries.map((entry) => {
      const values = entry.status === EntryStatus.RUNNING ? untrack(() => entry.values) : entry.values;
      const cached = saved.get(entry.id);
      if (cached && cached.values === values && cached.item.status === entry.status) return cached.item;
      const item: SavedEntry = {
        input: entry.input,
        cwd: entry.cwd,
        status: entry.status,
        error: entry.error,
        text: saved_text(values, (type) => shell.value_type(type)),
      };
      saved.set(entry.id, { values, item });
      return item;
    });
  });

  $effect(() => {
    prompt?.focus();
  });

  $effect(() => {
    if (initial_run && !untrack(() => started.value)) run(initial_run);
    started.value = true;
    // Closing the window stops what's running in it.
    return () => current?.abort();
  });
</script>

<!-- column-reverse keeps the view pinned to the newest output natively; mb-auto keeps short output at the top. -->
<div class="flex h-full flex-col bg-[light-dark(var(--background-lightest),var(--background-darker))] font-mono text-ui">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-3 py-2"
    onclick={(event) => {
      const target = event.target as HTMLElement;
      if (!target.closest("button, tr[tabindex], a") && !getSelection()?.toString()) prompt?.focus();
    }}
  >
    <div class="mb-auto flex flex-col gap-2">
      {#each session.entries as entry (entry.id)}
        <TerminalEntry {entry} />
      {/each}
      <PromptInput bind:this={prompt} bind:ctrl_latched={ctrl} {shell} {session} {running} onsubmit={run} onabort={() => current?.abort()} />
    </div>
  </div>
  <KeyRow {ctrl} onctrl={() => ((ctrl = !ctrl), prompt?.focus())} onkey={(key) => prompt?.press(key)} oninsert={(text) => prompt?.insert(text)} />
</div>
