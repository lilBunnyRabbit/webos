<script lang="ts">
  import { IconButton, Kbd } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { DotsThreeVertical as DotsIcon, Repeat as RepeatIcon } from "phosphor-svelte";
  import type { Pad } from "./board";
  import { TILE } from "./colors";
  import type { PlayState } from "./player.svelte";

  let {
    pad,
    state,
    drop_target = false,
    dragging = false,
    onplay,
    onmenu,
    ondragstart,
    ondragend,
  }: {
    pad: Pad;
    state: PlayState | undefined;
    drop_target?: boolean;
    dragging?: boolean;
    onplay: () => void;
    onmenu: (point: Position) => void;
    ondragstart: (event: DragEvent) => void;
    ondragend: () => void;
  } = $props();

  const tone = $derived(TILE[pad.color]);
</script>

<div
  role="listitem"
  class={cn("group relative min-w-0 transition-opacity", dragging && "opacity-40")}
  draggable="true"
  {ondragstart}
  {ondragend}
>
  <button
    type="button"
    class={cn(
      "flex aspect-[4/3] w-full min-w-0 flex-col justify-between rounded-xl p-3 text-left ring-1 ring-inset transition-[background-color,box-shadow,scale] duration-150 outline-none select-none",
      "focus-visible:ring-2 focus-visible:ring-cottontail active:scale-[0.97]",
      state ? tone.playing : tone.idle,
      drop_target && "ring-2 ring-primary/70"
    )}
    aria-label="Play {pad.label}{pad.key ? ` (${pad.key.toUpperCase()})` : ''}"
    aria-pressed={pad.loop ? !!state : undefined}
    onclick={onplay}
    onkeydown={(event) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onmenu({ x: rect.left + 8, y: rect.bottom - 8 });
      }
    }}
    {@attach long_press({ on_menu: onmenu })}
  >
    <span class="flex h-5 items-center gap-1.5 pr-7">
      {#if pad.key}<Kbd>{pad.key.toUpperCase()}</Kbd>{/if}
      {#if pad.loop}<RepeatIcon class="size-3.5 text-foreground/70" weight="bold" aria-label="Loops" />{/if}
      {#if state && state.count > 1}<span class="font-mono text-2xs text-foreground/80 tabular-nums">×{state.count}</span>{/if}
    </span>
    <span class="line-clamp-2 text-sm font-medium break-words text-foreground">{pad.label}</span>
  </button>

  {#if state}
    {#key state.started}
      <span class="pointer-events-none absolute inset-x-3 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-foreground/10">
        <span
          class={cn("progress block h-full origin-left rounded-full", tone.bar)}
          style:animation-duration="{state.duration}s"
          style:animation-iteration-count={state.loop ? "infinite" : "1"}
        ></span>
      </span>
    {/key}
  {/if}

  <IconButton
    label="Pad options"
    size="sm"
    class="absolute top-1.5 right-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
    onclick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onmenu({ x: rect.left, y: rect.bottom + 4 });
    }}
  >
    <DotsIcon weight="bold" />
  </IconButton>
</div>

<style>
  .progress {
    animation-name: progress;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes progress {
    from {
      scale: 0 1;
    }
    to {
      scale: 1 1;
    }
  }
</style>
