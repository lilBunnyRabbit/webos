<script lang="ts">
  import type { GraphicPlayer } from "./project-player.svelte";
  import { ease_out, progress, TRACE } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  // One stroke, angular on purpose: roof, walls, door. Drawn the same on the phone (faint) and on the paper (traced).
  const HOUSE = "M2 20 L20 4 L38 20 M6 17 L6 44 L34 44 L34 17 M16 44 L16 31 L24 31 L24 44";

  let pen_path: SVGPathElement | null = $state(null);

  const ghost = $derived(ease_out(progress(player.t, 0, TRACE.ghost)));
  const drawn = $derived(progress(player.t, TRACE.from, TRACE.length));
  const tip = $derived.by(() => {
    if (!pen_path || drawn <= 0 || drawn >= 1) return null;
    return pen_path.getPointAtLength(pen_path.getTotalLength() * drawn);
  });
</script>

<div class="grid h-full place-items-center py-2">
  <svg class="h-full max-h-28 w-auto max-w-[calc(100%-1rem)] overflow-visible" viewBox="0 0 160 110" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect class="paper" x="70" y="16" width="84" height="84" rx="3" />
    <g transform="translate(92 34)">
      <path bind:this={pen_path} class="pen" d={HOUSE} pathLength="1" stroke-dasharray="1 1" stroke-dashoffset={1 - drawn} />
      {#if tip}
        <g transform="translate({tip.x} {tip.y})">
          <line class="pencil" x1="0" y1="0" x2="9" y2="-13" />
          <circle class="nib" r="1.6" />
        </g>
      {/if}
    </g>

    <rect class="phone" x="8" y="4" width="54" height="100" rx="9" />
    <rect class="screen" x="12" y="12" width="46" height="84" rx="3" />
    <g transform="translate(15 32)" style:opacity={ghost}>
      <path class="ghost" d={HOUSE} />
    </g>
    <circle class="lens" cx="35" cy="8" r="1.3" />
    <path class="hint" d="M64 58 L69 58" />
  </svg>
</div>

<style>
  .phone {
    fill: var(--portfolio-card);
    stroke: color-mix(in oklch, var(--foreground) 24%, transparent);
    stroke-width: 1.2;
  }

  .screen {
    fill: color-mix(in oklch, var(--foreground) 6%, transparent);
  }

  .ghost {
    stroke: var(--primary);
    stroke-width: 1.6;
    opacity: 0.4;
  }

  .paper {
    fill: color-mix(in oklch, var(--foreground) 15%, transparent);
    stroke: color-mix(in oklch, var(--foreground) 14%, transparent);
    stroke-width: 0.8;
  }

  .pen {
    stroke: var(--foreground);
    stroke-width: 1.8;
  }

  .pencil {
    stroke: color-mix(in oklch, var(--foreground) 55%, transparent);
    stroke-width: 3;
  }

  .nib {
    fill: var(--primary);
  }

  .lens {
    fill: color-mix(in oklch, var(--foreground) 35%, transparent);
  }

  .hint {
    stroke: color-mix(in oklch, var(--foreground) 30%, transparent);
    stroke-width: 1.2;
    stroke-dasharray: 1.5 2;
  }
</style>
