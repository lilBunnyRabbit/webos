<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { SEASONS, watched_at } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const starts = SEASONS.map((_, index) => SEASONS.slice(0, index).reduce((sum, season) => sum + season.watched, 0));
  const total = SEASONS.reduce((sum, season) => sum + season.watched, 0);
  const seen = $derived(watched_at(player.t));
</script>

<div class="flex h-full flex-col justify-center gap-2 px-3.5 py-3 font-mono text-xs">
  {#each SEASONS as season, s (season.name)}
    <div class="flex items-center gap-2.5">
      <span class="w-5 shrink-0 text-foreground/65">{season.name}</span>
      <ol class="grid flex-1 grid-cols-8 gap-1">
        {#each { length: season.episodes } as _, e (e)}
          {@const order = starts[s] + e}
          {@const watched = e < season.watched && order < seen}
          {@const next = seen === total && order === total}
          <li class={cn("cell grid h-5 place-items-center rounded-sm", watched ? "bg-primary" : "bg-foreground/10", next && "next")}>
            {#if watched}<svg class="size-3 text-background" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
          </li>
        {/each}
      </ol>
    </div>
  {/each}
</div>

<style>
  .cell {
    transition: background-color 160ms var(--ease-out);
  }

  .next {
    box-shadow: inset 0 0 0 1.5px var(--primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
</style>
