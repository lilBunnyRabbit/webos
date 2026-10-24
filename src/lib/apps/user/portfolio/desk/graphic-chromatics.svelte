<script lang="ts">
  import type { GraphicPlayer } from "./project-player.svelte";
  import { palette_frame, SWATCHES } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const swatch = (l: number) => `oklch(from var(--primary) ${l} c h)`;
  const NEUTRAL = "color-mix(in oklch, var(--foreground) 12%, transparent)";

  const frame = $derived(palette_frame(player.t));
  const tint = (l: number) => `color-mix(in oklch, ${swatch(l)} ${frame.tint * 100}%, ${NEUTRAL})`;
</script>

<div class="palette flex h-full items-center justify-center gap-5 px-5">
  <div class="relative flex h-7 w-[46%] max-w-48 items-center">
    <span class="line absolute left-0 flex h-1.5 items-center rounded-full" style:width="{frame.typed * 100}%" style:opacity={frame.line}>
      <span class="caret absolute -right-1.5 h-3.5 w-0.5 rounded-full"></span>
    </span>
    <span class="flex h-full w-full gap-1">
      {#each SWATCHES as l, index (l)}
        {@const p = frame.swatches[index]}
        <span class="chip flex-1 rounded-[4px]" style:background={swatch(l)} style:opacity={p} style:scale="1 {p}"></span>
      {/each}
    </span>
  </div>

  <span class="shape flex h-[62%] max-h-24 w-[30%] max-w-32 items-end rounded-lg p-2" style:background={tint(SWATCHES[1])}>
    <span class="h-2.5 w-1/2 rounded-[4px]" style:background={tint(SWATCHES[4])}></span>
  </span>
</div>

<style>
  .line {
    background: color-mix(in oklch, var(--foreground) 28%, transparent);
  }

  .caret {
    background: var(--primary);
  }

  .chip {
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 12%, transparent);
  }

  .shape {
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 12%, transparent);
  }

  @container card (width < 15rem) {
    .palette {
      gap: 0.75rem;
      padding-inline: 0.75rem;
    }
  }
</style>
