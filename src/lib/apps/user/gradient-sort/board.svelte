<script lang="ts">
  import { format_time, grid_key_move, Stopwatch } from "$kit/games";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { tick, untrack } from "svelte";
  import type { RunProps } from "../color-recall/run";
  import ShareCard from "../color-recall/share-card.svelte";
  import { sort_share } from "./share";
  import { fewest_swaps, is_solved, scramble, sort_puzzle, SORT_CONFIGS, swap, valid_order, type SortState } from "./sort";
  import { Level } from "../color-recall/modes";
  import { z } from "zod";

  let { seed, level, daily, head, link, saved, onsave, onfinish, next }: RunProps<SortState> = $props();

  const DRAG_PX = 6;

  const { window: win, storage, achievements } = get_app_context();
  const sorts = storage.persisted("sorts", 0, z.number().int().nonnegative());
  const initial = untrack(() => ({ seed, saved, level }));
  const puzzle = sort_puzzle(initial.seed, SORT_CONFIGS[initial.level]);
  const restored = initial.saved && valid_order(initial.saved.order, puzzle) ? initial.saved : null;
  const clock = new Stopwatch(() => win.is_visible, restored?.ms ?? 0);
  const fewest = fewest_swaps(scramble(puzzle, initial.seed));

  let order = $state<number[]>(restored?.order ?? scramble(puzzle, initial.seed));
  let moves = $state(restored?.moves ?? 0);
  let selected = $state<number | null>(null);
  let cursor = $state(puzzle.anchors.findIndex((anchor) => !anchor));
  let drag = $state<{ from: number; x: number; y: number; over: number | null; moving: boolean } | null>(null);
  let board = $state<HTMLDivElement>();
  let swallow_click = false;

  const solved = $derived(is_solved(order, puzzle.colors));
  if (restored && restored.moves > 0 && !is_solved(restored.order, puzzle.colors)) clock.start();

  function save() {
    onsave({ order: [...order], moves, ms: clock.read() });
  }

  function record_sort() {
    sorts.value++;
    achievements.achieve("first-sort");
    if (daily) achievements.achieve("daily");
    if (initial.level === Level.HARD) achievements.achieve("hard");
    if (moves <= fewest) achievements.achieve("no-wasted-swaps");
    achievements.progress("sorts-25", sorts.value);
  }

  function apply(a: number, b: number) {
    const swapped = swap(order, puzzle.anchors, a, b);
    selected = null;
    if (!swapped) return;
    if (!clock.running) clock.start();
    order = swapped;
    moves++;
    if (is_solved(order, puzzle.colors)) {
      onfinish(clock.pause());
      record_sort();
    }
    save();
  }

  function press(index: number) {
    if (swallow_click) {
      swallow_click = false;
      return;
    }
    if (solved || puzzle.anchors[index]) return;
    if (selected === null) selected = index;
    else if (selected === index) selected = null;
    else apply(selected, index);
  }

  function tile_at(x: number, y: number): number | null {
    const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-index]");
    return tile && board?.contains(tile) ? Number(tile.dataset.index) : null;
  }

  function on_pointerdown(event: PointerEvent, index: number) {
    if (event.pointerType !== "mouse" || event.button !== 0 || solved || puzzle.anchors[index]) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { from: index, x: event.clientX, y: event.clientY, over: null, moving: false };
  }

  function on_pointermove(event: PointerEvent) {
    if (!drag) return;
    const moving = drag.moving || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_PX;
    drag = { ...drag, moving, over: moving ? tile_at(event.clientX, event.clientY) : null };
  }

  function on_pointerup() {
    if (!drag) return;
    if (drag.moving) {
      swallow_click = true;
      if (drag.over !== null) apply(drag.from, drag.over);
    }
    drag = null;
  }

  async function focus_tile(index: number) {
    cursor = index;
    await tick();
    board?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus({ preventScroll: true });
  }

  function on_keydown(event: KeyboardEvent) {
    const index = Number((event.target as HTMLElement).dataset.index);
    if (Number.isNaN(index)) return;
    if (event.key === "Escape" && selected !== null) {
      event.preventDefault();
      selected = null;
      return;
    }
    const moved = grid_key_move(event.key, index, puzzle.width, puzzle.height);
    if (moved === null) return;
    event.preventDefault();
    focus_tile(moved);
  }

  $effect(() => {
    if (win.is_focused && !solved && board && !board.contains(document.activeElement)) focus_tile(cursor);
  });
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 font-mono text-ui tabular-nums">
    <span>{moves} {moves === 1 ? "move" : "moves"}</span>
    <span class="rounded-full bg-foreground/8 px-2.5 py-0.5">{format_time(clock.elapsed)}</span>
  </div>
  <p class="shrink-0 px-4 pt-1 text-ui text-foreground/65" aria-live="polite">
    {#if solved}
      Sorted.
    {:else if selected !== null}
      Now tap the tile to swap it with.
    {:else}
      Swap tiles until the gradient flows. Tiles with a dot stay put.
    {/if}
  </p>
  <div class={cn("board-area grid min-h-0 flex-1 place-items-center p-3", solved && "max-h-[45%] shrink-0")}>
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      bind:this={board}
      role="grid"
      aria-label="Gradient, {puzzle.width} by {puzzle.height}. Arrow keys move, Enter picks a tile and Enter on another swaps them"
      class="board grid gap-0.5"
      style:grid-template-columns="repeat({puzzle.width}, minmax(0, 1fr))"
      style:--ratio="{puzzle.width} / {puzzle.height}"
      style:--aspect={puzzle.width / puzzle.height}
      onkeydown={on_keydown}
    >
      {#each order as tile, index (index)}
        {@const anchor = puzzle.anchors[index]}
        <button
          data-index={index}
          role="gridcell"
          tabindex={index === cursor ? 0 : -1}
          aria-label="{anchor ? 'Fixed tile' : 'Tile'} {Math.floor(index / puzzle.width) + 1}, {(index % puzzle.width) + 1}"
          aria-selected={selected === index}
          aria-disabled={anchor || solved}
          class={cn(
            "relative grid min-h-0 place-items-center transition-[scale,opacity] duration-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cottontail",
            anchor || solved ? "cursor-default" : "cursor-grab",
            selected === index && "z-10 scale-90 rounded-md outline-3 outline-offset-2 outline-foreground",
            drag?.moving && drag.from === index && "opacity-40",
            drag?.moving && drag.over === index && !anchor && "z-10 rounded-md outline-3 outline-offset-1 outline-foreground"
          )}
          style:background-color={puzzle.colors[tile]}
          onclick={() => press(index)}
          onfocus={() => (cursor = index)}
          onpointerdown={(event) => on_pointerdown(event, index)}
          onpointermove={on_pointermove}
          onpointerup={on_pointerup}
          onlostpointercapture={on_pointerup}
        >
          {#if anchor}<span class="size-1.5 rounded-full bg-background ring-2 ring-foreground/70" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>
  </div>
  {#if solved}
    <div class="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto px-4 pb-4">
      <p class="text-center">
        <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">{daily ? "Today's gradient" : "Sorted"}</span>
        <span class="font-mono text-3xl font-semibold tabular-nums">{format_time(clock.elapsed)}</span>
        <span class="block text-ui text-foreground/65">{moves} {moves === 1 ? "move" : "moves"}</span>
      </p>
      <ShareCard text={sort_share(head, clock.read(), moves, link)} {next} />
    </div>
  {/if}
</div>

<style>
  .board-area {
    container-type: size;
  }

  .board {
    width: min(100cqw, 100cqh * var(--aspect), 40rem);
    aspect-ratio: var(--ratio);
  }
</style>
