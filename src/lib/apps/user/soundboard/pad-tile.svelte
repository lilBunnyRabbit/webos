<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { IconButton, Kbd } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { DotsThreeVertical as DotsIcon, Repeat as RepeatIcon } from "phosphor-svelte";
  import type { Pad } from "./board";
  import { pad_tone, TILE } from "./colors";
  import type { PlayState } from "./player.svelte";

  let {
    pad,
    state: playing,
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

  const files = $derived(kernel.service<FilesService>("files"));
  let image_url = $state<string | null>(null);

  $effect(() => {
    const path = pad.image;
    image_url = null;
    if (!path) return;
    let object_url: string | null = null;
    let cancelled = false;
    files
      .get_file(path)
      .then((file) => {
        if (cancelled || !file) return;
        object_url = URL.createObjectURL(file);
        image_url = object_url;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (object_url) URL.revokeObjectURL(object_url);
    };
  });
</script>

<div
  role="listitem"
  class={cn("group relative min-w-0 transition-opacity", dragging && "opacity-40")}
  style:--pad={pad_tone(pad.color)}
  draggable="true"
  {ondragstart}
  {ondragend}
>
  <button
    type="button"
    class={cn(
      "relative isolate flex aspect-[4/3] w-full min-w-0 flex-col justify-between overflow-hidden rounded-xl p-3 text-left ring-1 ring-inset transition-[background-color,box-shadow,scale] duration-150 outline-none select-none",
      "focus-visible:ring-2 focus-visible:ring-cottontail active:scale-[0.97]",
      playing ? TILE.playing : TILE.idle,
      drop_target && "ring-2 ring-primary/70"
    )}
    aria-label="Play {pad.label}{pad.key ? ` (${pad.key.toUpperCase()})` : ''}"
    aria-pressed={pad.loop ? !!playing : undefined}
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
    {#if image_url}
      <img src={image_url} alt="" class="absolute inset-0 -z-10 size-full object-cover" draggable="false" onerror={() => (image_url = null)} />
      <span class="absolute inset-0 -z-10 bg-background/60"></span>
      <span class={cn("absolute inset-0 -z-10 transition-colors", playing ? "bg-(color:--pad)/38" : "bg-(color:--pad)/18 group-hover:bg-(color:--pad)/26")}></span>
    {/if}
    <span class="flex h-5 items-center gap-1.5 pr-7">
      {#if pad.key}<Kbd>{pad.key.toUpperCase()}</Kbd>{/if}
      {#if pad.loop}<RepeatIcon class="size-3.5 text-foreground/70" weight="bold" aria-label="Loops" />{/if}
      {#if playing && playing.count > 1}<span class="font-mono text-2xs text-foreground/80 tabular-nums">×{playing.count}</span>{/if}
    </span>
    <span class="line-clamp-2 text-sm font-medium break-words text-foreground">{pad.label}</span>
  </button>

  {#if playing}
    {#key playing.started}
      <span class="pointer-events-none absolute inset-x-3 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-foreground/10">
        <span
          class={cn("progress block h-full origin-left rounded-full", TILE.bar)}
          style:animation-duration="{playing.duration}s"
          style:animation-iteration-count={playing.loop ? "infinite" : "1"}
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
