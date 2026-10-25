<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { HQ_COMMAND, HQ_PHASES, HQ_REPOS, hq_frame } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const frame = $derived(hq_frame(player.t));
  const typed = $derived(HQ_COMMAND.slice(0, Math.round(frame.typed * HQ_COMMAND.length)));
</script>

<div class="scene grid h-full place-items-center py-3 font-mono">
  <div class="flow flex w-full items-start">
    <div class="term pane">
      <p class="caption">capture</p>
      <p class="truncate text-foreground"><span class="text-foreground/55">$</span> {typed}{#if frame.typed > 0 && frame.typed < 1}<span class="text-primary">▍</span>{/if}</p>
      <p class="truncate text-foreground" style:opacity={frame.learn}><span class="text-primary">›</span> /learn</p>
    </div>

    <span class="wire term-wire"><span style:scale="{frame.phase >= 0 ? 1 : 0} 1"></span></span>

    <div class="pane">
      <p class="caption">quest</p>
      <p class="truncate text-foreground transition-opacity duration-300" style:opacity={frame.phase >= 0 ? 1 : 0}>flaky login test</p>
      <ol class="phases flex min-w-0 gap-1">
        {#each HQ_PHASES as name, index (name)}
          <li class={cn("chip", index < frame.phase && "past", index === frame.phase && "now")}>{name}</li>
        {/each}
      </ol>
    </div>

    <span class="wire"><span style:scale="{frame.learn} 1"></span></span>

    <div class="pane">
      <p class="caption">every repo</p>
      <ul class="flex flex-col gap-1">
        {#each HQ_REPOS as repo, index (repo)}
          {@const lit = frame.repos[index]}
          <li class="flex min-w-0 items-center gap-2">
            <span class="dot size-2 shrink-0 rounded-full" style:--lit={lit}></span>
            <span class={cn("truncate transition-colors duration-300", lit > 0.5 ? "text-foreground" : "text-foreground/55")}>{repo}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .scene {
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

  .phases {
    overflow: hidden;
  }

  .chip {
    flex: none;
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
    background: color-mix(in oklch, var(--foreground) 6%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .chip.past {
    color: var(--secondary);
  }

  .chip.now {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 16%, transparent);
  }

  .dot {
    background: color-mix(in oklch, var(--tertiary) calc(var(--lit) * 100%), color-mix(in oklch, var(--foreground) 20%, transparent));
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
    .term,
    .term-wire {
      display: none;
    }
  }

  @container card (width < 22rem) {
    .scene {
      padding-inline: 0.75rem;
    }

    .chip:not(.now) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wire > span,
    .chip {
      transition: none;
    }
  }
</style>
