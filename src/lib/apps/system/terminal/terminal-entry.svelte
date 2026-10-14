<script lang="ts">
  import { EntryStatus, type Entry } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { Spinner } from "$lib/core/components/ui";
  import EntryOutput from "./entry-output.svelte";

  let { entry }: { entry: Entry } = $props();
</script>

<div class="flex flex-col gap-0.5">
  <div class="flex min-w-0 items-baseline gap-2">
    <span class="shrink-0 text-primary/80">{tilde_path(entry.cwd)}</span>
    <span class="shrink-0 text-foreground/50">❯</span>
    <span class="min-w-0 break-all whitespace-pre-wrap">{entry.input}</span>
    {#if entry.status === EntryStatus.RUNNING}<Spinner label="Running" class="self-center" />{/if}
  </div>
  {#if entry.values.length > 0}
    <EntryOutput values={entry.values} />
  {/if}
  {#if entry.error}
    <p class="break-words whitespace-pre-wrap text-error">{entry.error}</p>
  {:else if entry.status === EntryStatus.ABORTED}
    <p class="text-foreground/50">^C</p>
  {/if}
</div>
