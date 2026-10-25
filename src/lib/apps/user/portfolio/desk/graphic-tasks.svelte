<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon } from "phosphor-svelte";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { progress, TASKS } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const t = $derived(player.t);
</script>

<ul class="lanes flex h-full flex-col justify-center gap-2.5 px-3.5 py-3 font-mono text-xs">
  {#each TASKS as task (task.name)}
    {@const p = progress(t, task.start, task.length)}
    <li class="task">
      <span class={cn("truncate transition-colors", p > 0 ? "text-foreground" : "text-foreground/65")}>{task.name}</span>
      <span class="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <span class="block h-full rounded-full bg-primary" style:width="{p * 100}%"></span>
      </span>
      <span class="grid place-items-center">
        {#if p >= 1}<CheckIcon class="size-3.5 text-secondary" weight="bold" />{/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .task {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 1rem;
    align-items: center;
    gap: 0.625rem;
  }

  @container card (width < 12.5rem) {
    .lanes {
      padding-inline: 0.625rem;
    }

    .task {
      grid-template-columns: 4rem minmax(0, 1fr) 0.875rem;
      gap: 0.375rem;
    }
  }
</style>
