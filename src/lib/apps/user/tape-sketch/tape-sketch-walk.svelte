<script lang="ts">
  import { Button, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowDownLeft as ArrowDownLeftIcon,
    ArrowDownRight as ArrowDownRightIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    ArrowUpLeft as ArrowUpLeftIcon,
    ArrowUpRight as ArrowUpRightIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import type { Editor } from "./editor.svelte";
  import { DIRECTIONS, nearest_direction, snap_directions, snap_preset, SnapPreset, type Direction } from "./geometry";
  import { rotate } from "./rotation";
  import TapeSketchKeys from "./tape-sketch-keys.svelte";
  import TapeSketchRing from "./tape-sketch-ring.svelte";

  interface Props {
    editor: Editor;
    can_close: boolean;
    rotation: number;
    onstep: (direction: Direction) => void;
    onclose: () => void;
    ondone: () => void;
  }

  let { editor, can_close, rotation, onstep, onclose, ondone }: Props = $props();

  const ICONS: Record<string, Component<{ class?: string; weight?: "bold" }>> = {
    nw: ArrowUpLeftIcon,
    n: ArrowUpIcon,
    ne: ArrowUpRightIcon,
    w: ArrowLeftIcon,
    e: ArrowRightIcon,
    sw: ArrowDownLeftIcon,
    s: ArrowDownIcon,
    se: ArrowDownRightIcon,
  };

  const ready = $derived(!!editor.walk_from);
  const has_length = $derived(Number(editor.input) > 0);
  const directions = $derived(snap_directions(editor.sketch.snap));
  const grid = $derived(snap_preset(editor.sketch.snap) === SnapPreset.DEG_45);

  // The pad shows directions as they look on screen, so a turned sketch walks the way the arrow points.
  function step_toward(screen: Direction) {
    const direction = nearest_direction(directions, rotate(screen, -rotation));
    if (direction) onstep(direction);
  }

  function keep_focus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<section class="sheet flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 pt-2.5 pb-3" aria-label="Walk">
  <div class="flex items-center gap-2">
    <div class="min-w-0 flex-1">
      <div class="text-ui font-medium">Walk</div>
      <div class="truncate text-2xs text-foreground/65">
        {ready ? "Type a length, then tap a direction" : "Tap a corner or a spot to start from"}
      </div>
    </div>
    {#if can_close}
      <Button size="sm" variant="secondary" onclick={onclose}>Close shape</Button>
    {/if}
    <Button size="sm" variant="primary" onclick={ondone}>Done</Button>
  </div>

  <div class="flex h-12 items-center gap-2 rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 ring-1 ring-foreground/15 ring-inset">
    <output class="min-w-0 flex-1 truncate text-right font-mono text-2xl tabular-nums" aria-live="polite">
      {#if editor.input}{editor.input}{:else}<span class="text-foreground/38">0</span>{/if}
    </output>
    <span class="font-mono text-ui text-foreground/65">{editor.sketch.unit}</span>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <TapeSketchKeys class="grid-rows-[repeat(4,2.75rem)]" onpress={(key) => editor.press(key)} />
    {#if grid}
    <div class="grid grid-cols-3 grid-rows-[repeat(3,1fr)] gap-1.5" role="group" aria-label="Directions">
      {#each DIRECTIONS as direction, i (direction.id)}
        {@const Icon = ICONS[direction.id]}
        {#if i === 4}<span class="grid place-items-center text-2xs text-foreground/38" aria-hidden="true">•</span>{/if}
        <button
          type="button"
          tabindex={-1}
          class={cn(button({ variant: has_length && ready ? "primary" : "secondary", class: "h-full rounded-lg px-0 pointer-coarse:h-full" }))}
          aria-label="Walk {direction.label.toLowerCase()}"
          disabled={!ready}
          onpointerdown={keep_focus}
          onclick={() => step_toward(direction)}
        >
          <Icon class="size-6" weight="bold" />
        </button>
      {/each}
    </div>
    {:else}
      <TapeSketchRing {directions} {rotation} disabled={!ready} armed={has_length} onpick={onstep} />
    {/if}
  </div>
</section>
