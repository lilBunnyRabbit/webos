<script lang="ts">
  import { format_date } from "$lib/core/utils";
  import EntryRow from "./entry-row.svelte";
  import type { IndexEntry } from "./journal";
  import { local_date, MOOD_LABELS, mood_level, type DayStat } from "./mood";

  interface Props {
    date: string;
    entries: readonly IndexEntry[];
    stat: DayStat | undefined;
    onopen: (meta: IndexEntry) => void;
  }

  let { date, entries, stat, onopen }: Props = $props();
</script>

<section class="grid gap-1" aria-label={format_date(local_date(date))}>
  <h3 class="flex items-baseline gap-2 px-2 text-ui font-medium">
    {format_date(local_date(date))}
    {#if stat?.mood !== null && stat?.mood !== undefined}
      <span class="text-2xs font-normal text-foreground/80">{MOOD_LABELS[mood_level(stat.mood)]}</span>
    {/if}
  </h3>
  {#if entries.length}
    <ul class="grid gap-0.5">
      {#each entries as meta (meta.id)}<li><EntryRow {meta} {onopen} /></li>{/each}
    </ul>
  {:else}
    <p class="px-2 text-ui text-foreground/65">Nothing written this day.</p>
  {/if}
</section>
