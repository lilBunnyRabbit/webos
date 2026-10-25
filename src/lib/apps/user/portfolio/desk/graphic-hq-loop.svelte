<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { HQ_PARTS, LOOP, LOOP_RUN, QUEST_LIST, step_at } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const picked = $derived(player.t >= LOOP.pick);
  const step = $derived(step_at(player.t, LOOP.run, LOOP.every, LOOP_RUN.length));
  const touched = $derived(new Set(LOOP_RUN.slice(0, step + 1).map((run) => run.part)));
  const now = $derived(step >= 0 ? LOOP_RUN[step].part : null);
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane hq-wide">
      <p class="hq-caption">$ hq ls</p>
      <ul class="flex flex-col gap-0.5">
        {#each QUEST_LIST as quest, index (quest.id)}
          <li class={cn("row", index === 0 && picked && "picked")}>
            <span class="text-foreground/45">{quest.id}</span>
            <span class="min-w-0 flex-1 truncate">{quest.title}</span>
          </li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire hq-wide"><span style:scale="{step >= 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption truncate">$ hq start 3fa</p>
      <ul class="flex flex-col gap-0.5">
        {#each LOOP_RUN as run, index (run.line)}
          <li class={cn("run truncate", index <= step && "in", index === step && "now")}><span class="text-secondary">✓</span> {run.line}</li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire"><span style:scale="{step >= 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane parts">
      <p class="hq-caption">hq</p>
      <ul class="flex flex-col gap-0.5">
        {#each HQ_PARTS as part (part)}
          <li class={cn("part truncate", touched.has(part) && "touched", now === part && "now")}>{part}</li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .parts {
    flex: 0 1 8rem;
  }

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

  .part {
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .part.touched {
    color: var(--tertiary);
  }

  .part.now {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .row,
    .run,
    .part {
      transition: none;
    }
  }
</style>
