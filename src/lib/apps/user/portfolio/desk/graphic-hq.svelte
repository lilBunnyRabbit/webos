<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { RECALL_SYMPTOM, recall_frame } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const frame = $derived(recall_frame(player.t));
  const typed = $derived(RECALL_SYMPTOM.slice(0, Math.round(frame.typed * RECALL_SYMPTOM.length)));
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane">
      <p class="hq-caption truncate">fresh session, any repo</p>
      <p class="truncate text-foreground"><span class="text-primary">›</span> {typed}</p>
      <p class="truncate text-foreground" style:opacity={frame.fix}><span class="text-secondary">✓</span> push over SSH</p>
    </div>

    <span class="hq-wire"><span style:scale="{frame.pointer ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption">hq knowledge</p>
      <p class={cn("hop truncate", frame.pointer && "on")}>AGENTS.md › tooling</p>
      <p class={cn("hop truncate", frame.index && "on")}>workflow scope: use SSH</p>
    </div>

    <span class="hq-wire hq-wide"><span style:scale="{frame.fix > 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane hq-wide">
      <p class="hq-caption">retrieval eval</p>
      <p class="score text-foreground tabular-nums">{frame.score}<span class="text-foreground/45">/10</span></p>
      <p class="truncate text-foreground/55">found from the symptom</p>
    </div>
  </div>
</div>

<style>
  .hop {
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .hop.on {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }

  .score {
    font-size: 1.5em;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .hop {
      transition: none;
    }
  }
</style>
