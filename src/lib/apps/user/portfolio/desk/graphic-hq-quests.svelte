<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { QUEST, QUEST_LIST, QUEST_RUN, quest_step } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const picked = $derived(player.t >= QUEST.pick);
  const step = $derived(quest_step(player.t));
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane hq-wide">
      <p class="hq-caption">$ hq ls</p>
      <ul class="flex flex-col gap-0.5">
        {#each QUEST_LIST as quest, index (quest.id)}
          {@const status = index === 0 && step >= 0 ? QUEST_RUN[step].status : quest.status}
          <li class={cn("row", index === 0 && picked && "picked")}>
            <span class="text-foreground/45">{quest.id}</span>
            <span class="min-w-0 flex-1 truncate">{quest.title}</span>
            <span class={cn("status", index === 0 && step >= 0 && "live")}>{status}</span>
          </li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire hq-wide"><span style:scale="{step >= 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption truncate">$ hq start 3fa</p>
      <ul class="flex flex-col gap-0.5">
        {#each QUEST_RUN as run, index (run.line)}
          <li class={cn("run truncate", index <= step && "in", index === step && "now")}><span class="text-secondary">✓</span> {run.line}</li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 75%, transparent);
    transition: background-color 200ms;
  }

  .row.picked {
    color: var(--foreground);
    background: color-mix(in oklch, var(--primary) 12%, transparent);
  }

  .status {
    flex: none;
    color: color-mix(in oklch, var(--foreground) 50%, transparent);
  }

  .status.live {
    color: var(--primary);
  }

  .run {
    color: var(--foreground);
    opacity: 0;
    translate: 0 0.25rem;
    transition: opacity 250ms, translate 250ms var(--ease-out);
  }

  .run.in {
    opacity: 1;
    translate: none;
  }

  .run.now {
    color: var(--primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .run {
      transition: none;
    }
  }
</style>
