<script lang="ts">
  import kernel, { type AppsService, type FilesService, type WidgetProps } from "$lib/core/api";
  import { Button } from "$lib/core/components/ui";
  import { create_storage_handle } from "$lib/core/contexts/app";
  import { report_error } from "$kit/utils/report-error";
  import { PencilSimpleLine as PencilIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { add_line, capture, writable, type Added } from "./capture";
  import { inbox_path, remove_from_inbox } from "./inbox";
  import { APP_ID, JOURNAL_ROOT } from "./journal";
  import { MOOD_LABELS, type Mood } from "./mood";
  import MoodPicker from "./mood-picker.svelte";
  import { child, list_journals, type JournalRef } from "./store";

  let { size }: WidgetProps = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const last_journal = create_storage_handle(APP_ID, {}).persisted<string | null>("journal", null, z.string().nullable());

  let journals = $state.raw<JournalRef[]>([]);
  let loaded = $state(false);
  let last = $state.raw<(Added & { what: string }) | null>(null);
  let note = $state<string | null>(null);
  let clear_timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    files.revision("/home");
    files.revision(JOURNAL_ROOT);
    untrack(() =>
      list_journals(files)
        .then((list) => (journals = list))
        .catch(() => (journals = []))
        .finally(() => (loaded = true))
    );
  });

  $effect(() => () => clearTimeout(clear_timer));

  const targets = $derived(writable(journals));
  const target = $derived(targets.find((journal) => journal.name === last_journal.value) ?? targets[0] ?? null);

  function done(added: Added, what: string) {
    last = { ...added, what };
    note = null;
    clearTimeout(clear_timer);
    clear_timer = setTimeout(() => (last = null), 6000);
  }

  async function tap(mood: Mood | undefined) {
    if (!mood || !target) return;
    try {
      done(await add_line(files, target, "", mood), `${MOOD_LABELS[mood]} saved`);
    } catch (reason) {
      report_error(APP_ID, "Couldn't save the mood", reason);
    }
  }

  async function write() {
    try {
      const added = await capture(files, journals, target?.name ?? null);
      if (added) done(added, "Line saved");
    } catch (reason) {
      report_error(APP_ID, "Couldn't save the line", reason);
    }
  }

  async function undo() {
    if (!last) return;
    const { ref, id } = last;
    clearTimeout(clear_timer);
    last = null;
    const path = child(inbox_path(ref), `${id}.bin`);
    if (!(await files.get_file(path))) {
      note = "Already in the journal: delete it there.";
      return;
    }
    await remove_from_inbox(files, ref, id);
    note = "Removed.";
  }

  $effect(() => {
    if (!note) return;
    const timer = setTimeout(() => (note = null), 4000);
    return () => clearTimeout(timer);
  });
</script>

<div class="flex size-full flex-col justify-center gap-2 p-2 [container-type:size]">
  {#if !loaded}
    <span></span>
  {:else if !target}
    <p class="text-center text-ui text-foreground/80">Make a journal first.</p>
    <Button size="sm" class="self-center" onclick={() => apps.launch(APP_ID)}>Open Moonrabbit</Button>
  {:else}
    {#if targets.length > 1}<p class="truncate text-center text-2xs text-foreground/80">{target.name}</p>{/if}
    <MoodPicker value={undefined} onchange={tap} label="How are you?" size={size.w >= 4 ? "lg" : "md"} class="justify-center" />
    <div class="flex min-h-7 items-center justify-center gap-1 text-ui" aria-live="polite">
      {#if last}
        <span class="text-foreground/80">{last.what}</span>
        <Button variant="quiet" size="sm" onclick={undo}>Undo</Button>
      {:else if note}
        <span class="text-foreground/80">{note}</span>
      {:else}
        <Button variant="secondary" size="sm" onclick={write}><PencilIcon weight="bold" />Write a line</Button>
      {/if}
    </div>
  {/if}
</div>
