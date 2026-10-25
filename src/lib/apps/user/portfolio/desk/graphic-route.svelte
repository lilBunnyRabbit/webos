<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { ROUTE, route_frame } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const frame = $derived(route_frame(player.t));
  const last = ROUTE.length - 1;
  const span = (1 - 1 / ROUTE.length) * 100;
  const along = $derived((frame.position / last) * span);
</script>

<div class="scene flex h-full flex-col justify-center gap-2.5 font-mono">
  <p class="caption truncate">c.to(Rec2020)</p>

  <div class="route relative grid" style:--count={ROUTE.length}>
    <span class="wire absolute"><span style:width="{(frame.position / last) * 100}%"></span></span>
    <span class="traveller absolute size-2.5 rounded-full bg-primary" style:left="calc({50 / ROUTE.length}% + {along}%)"></span>
    {#each ROUTE as hop, index (hop.model)}
      <span class={cn("node", index < frame.reached && "passed", index === frame.reached && "now")}>
        <span class="dot size-2 rounded-full"></span>
        <span class="label">{hop.model}</span>
      </span>
    {/each}
  </div>

  <p class="readout grid">
    {#each ROUTE as hop, index (hop.model)}
      <span class={cn("value truncate", index === frame.reached && "shown")}><span class="model">{hop.model.toLowerCase()}</span> {hop.value}</span>
    {/each}
  </p>
</div>

<style>
  .scene {
    padding-inline: 0.875rem;
    font-size: var(--text-xs);
  }

  .caption {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .route {
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
  }

  .wire {
    top: 0.25rem;
    left: calc(50% / var(--count));
    right: calc(50% / var(--count));
    height: 1px;
    background: color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .wire > span {
    display: block;
    height: 100%;
    max-width: 100%;
    background: var(--primary);
  }

  .traveller {
    top: 0.25rem;
    translate: -50% -50%;
    box-shadow: 0 0 0 0.25rem color-mix(in oklch, var(--primary) 18%, transparent);
  }

  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .dot {
    background: var(--portfolio-inset, var(--background));
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 30%, transparent);
    transition: background-color 200ms, box-shadow 200ms;
  }

  .label {
    white-space: nowrap;
    color: color-mix(in oklch, var(--foreground) 50%, transparent);
    transition: color 200ms;
  }

  .passed .dot {
    background: var(--tertiary);
    box-shadow: none;
  }

  .passed .label {
    color: var(--tertiary);
  }

  .now .dot {
    background: var(--primary);
    box-shadow: none;
  }

  .now .label {
    color: var(--primary);
  }

  .readout {
    justify-items: center;
    color: var(--foreground);
  }

  .value {
    grid-area: 1 / 1;
    max-width: 100%;
    opacity: 0;
    transition: opacity 200ms;
  }

  .value.shown {
    opacity: 1;
  }

  .model {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  @container card (width >= 30rem) {
    .scene {
      padding-inline: 2rem;
      gap: 0.875rem;
      font-size: var(--text-ui);
    }
  }

  @container card (width < 15rem) {
    .scene {
      padding-inline: 0.5rem;
    }

    .label {
      font-size: 0.625rem;
    }

    .model {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot,
    .label,
    .value {
      transition: none;
    }
  }
</style>
