<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { WEBOS, webos_frame } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const frame = $derived(webos_frame(player.t));
</script>

<div class="desk relative h-full overflow-hidden">
  {#each WEBOS.windows as win, index (index)}
    <span class="preview absolute rounded-md" style:left="{win.snap.to.x}%" style:top="{win.snap.to.y}%" style:width="{win.snap.to.width}%" style:height="{win.snap.to.height}%" style:opacity={frame.previews[index]}></span>
  {/each}

  {#each frame.rects as rect, index (index)}
    {@const p = frame.shown[index]}
    <span
      class={cn("win absolute flex flex-col overflow-hidden rounded-md", index === frame.front && "front")}
      style:left="{rect.x}%"
      style:top="{rect.y}%"
      style:width="{rect.width}%"
      style:height="{rect.height}%"
      style:opacity={p}
      style:scale={0.94 + 0.06 * p}
    >
      <span class="bar h-3 shrink-0"></span>
    </span>
  {/each}

  <span class="taskbar absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5">
    {#each frame.shown as p, index (index)}
      <span class={cn("app h-1 w-3 rounded-full", index === frame.front && "active")} style:opacity={p} style:scale="{p} 1"></span>
    {/each}
  </span>
</div>

<style>
  .desk {
    isolation: isolate;
    background: var(--portfolio-inset);
  }

  .preview {
    background: color-mix(in oklch, var(--primary) 12%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--primary) 50%, transparent);
  }

  .win {
    z-index: 1;
    background: var(--portfolio-card);
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent);
    transform-origin: 50% 100%;
  }

  .win.front {
    z-index: 2;
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--primary) 70%, transparent),
      0 6px 14px -6px color-mix(in oklch, var(--background-darkest) 70%, transparent);
  }

  .bar {
    background: color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  .front .bar {
    background: color-mix(in oklch, var(--primary) 24%, transparent);
  }

  .taskbar {
    height: 12%;
    min-height: 0.75rem;
    z-index: 3;
    background: color-mix(in oklch, var(--foreground) 6%, transparent);
  }

  .app {
    background: color-mix(in oklch, var(--foreground) 30%, transparent);
  }

  .app.active {
    background: var(--primary);
  }
</style>
