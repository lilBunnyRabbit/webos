<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { HQ, HQ_PARTS, HQ_QUESTS, HQ_RUN, hq_step } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const picked = $derived(player.t >= HQ.pick);
  const step = $derived(hq_step(player.t));
  const touched = $derived(new Set(HQ_RUN.slice(0, step + 1).map((run) => run.part)));
  const now = $derived(step >= 0 ? HQ_RUN[step].part : null);
</script>

<div class="scene grid h-full place-items-center py-3 font-mono">
  <div class="flow flex w-full items-start">
    <div class="pane wide">
      <p class="caption">$ hq ls</p>
      <ul class="flex flex-col gap-0.5">
        {#each HQ_QUESTS as quest, index (quest.id)}
          <li class={cn("row", index === 0 && picked && "picked")}>
            <span class="text-foreground/45">{quest.id}</span>
            <span class="min-w-0 flex-1 truncate">{quest.title}</span>
          </li>
        {/each}
      </ul>
    </div>

    <span class="wire wide"><span style:scale="{step >= 0 ? 1 : 0} 1"></span></span>

    <div class="pane">
      <p class="caption truncate">$ hq start 3fa</p>
      <ul class="flex flex-col gap-0.5">
        {#each HQ_RUN as run, index (run.line)}
          <li class={cn("run truncate", index <= step && "in", index === step && "now")}><span class="text-secondary">✓</span> {run.line}</li>
        {/each}
      </ul>
    </div>

    <span class="wire"><span style:scale="{step >= 0 ? 1 : 0} 1"></span></span>

    <div class="pane parts">
      <p class="caption">hq</p>
      <ul class="flex flex-col gap-0.5">
        {#each HQ_PARTS as part (part)}
          <li class={cn("part truncate", touched.has(part) && "touched", now === part && "now")}>{part}</li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .scene {
    grid-template-columns: minmax(0, 1fr);
    padding-inline: 0.875rem;
    font-size: var(--text-xs);
  }

  .flow {
    gap: 0.625rem;
  }

  .pane {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }

  .parts {
    flex: 0 1 8rem;
  }

  .caption {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .wire {
    position: relative;
    flex: 0 0 1.25rem;
    height: 1px;
    margin-top: 2.1em;
    background: color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .wire > span {
    position: absolute;
    inset: 0;
    background: var(--primary);
    transform-origin: left;
    transition: scale 250ms var(--ease-out);
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

  @container card (width >= 44rem) {
    .scene {
      padding-inline: 2.5rem;
      font-size: var(--text-ui);
    }

    .flow {
      gap: 1.25rem;
    }

    .pane {
      gap: 0.5rem;
    }

    .wire {
      flex-basis: 2.5rem;
    }
  }

  @container card (width < 28rem) {
    .wide {
      display: none;
    }

    .parts {
      flex-basis: 6rem;
    }
  }

  @container card (width < 22rem) {
    .scene {
      padding-inline: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wire > span,
    .row,
    .run,
    .part {
      transition: none;
    }
  }
</style>
