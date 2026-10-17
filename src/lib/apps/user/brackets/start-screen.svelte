<script lang="ts">
  import { Button, EmptyState } from "$lib/core/components/ui";
  import { format_date } from "$lib/core/utils";
  import { FileText as FileTextIcon, Plus as PlusIcon, Trophy as TrophyIcon } from "phosphor-svelte";
  import { FORMAT_LABELS } from "./bracket";
  import type { BracketEntry } from "./store";

  interface Props {
    entries: BracketEntry[];
    loaded: boolean;
    onopen: (path: string) => void;
    onnew: () => void;
  }

  let { entries, loaded, onopen, onnew }: Props = $props();
</script>

{#if loaded && entries.length === 0}
  <EmptyState icon={TrophyIcon} title="No brackets yet" description="Set up a knockout, a league or a race cup for tonight's games.">
    {#snippet actions()}
      <Button variant="primary" onclick={onnew}><PlusIcon weight="bold" />New bracket</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="mx-auto flex max-w-2xl flex-col gap-2 p-4 @md:p-6">
    <h2 class="px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Recent brackets</h2>
    {#if !loaded}
      {#each { length: 4 }, index (index)}
        <div class="h-8 rounded-md bg-foreground/5 animate-pulse" style:opacity={1 - index * 0.2}></div>
      {/each}
    {:else}
      <ul class="flex flex-col">
        {#each entries as entry (entry.path)}
          <li>
            <button
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cottontail"
              title={entry.path}
              onclick={() => onopen(entry.path)}
            >
              <FileTextIcon class="size-4 shrink-0 text-foreground/70" weight="duotone" />
              <span class="min-w-0 flex-1 truncate">{entry.name}</span>
              <span class="hidden shrink-0 text-2xs text-foreground/65 @md:block">{FORMAT_LABELS[entry.format]} · {entry.players} players</span>
              <span class="w-24 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">{format_date(entry.modified)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
