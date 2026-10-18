<script lang="ts">
  import { grid_key_move, Stopwatch } from "$kit/games";
  import { BoardOverlay, Button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { tick, untrack } from "svelte";
  import { MISS_PENALTY_MS, ODD_MS, odd_round, remaining_ms, type OddState } from "./odd";
  import type { RunProps } from "./run";
  import ShareCard from "./share-card.svelte";
  import { odd_share } from "./share";

  let { seed, daily, head, link, saved, onsave, onfinish, next }: RunProps<OddState> = $props();

  const { window: win } = get_app_context();
  const initial = untrack(() => ({ seed, saved }));
  const clock = new Stopwatch(() => win.is_visible, initial.saved?.ms ?? 0);

  let hits = $state(initial.saved?.hits ?? 0);
  let misses = $state(initial.saved?.misses ?? 0);
  let done = $state(initial.saved?.done ?? false);
  let cursor = $state(0);
  let flash = $state<number | null>(null);
  let board = $state<HTMLDivElement>();

  const started = $derived(clock.running || clock.elapsed > 0);
  const round = $derived(odd_round(initial.seed, hits));
  const left = $derived(remaining_ms(clock.elapsed, misses));
  const seconds = $derived(Math.ceil(left / 1000));
  const tiles = $derived(Array.from({ length: round.size * round.size }, (_, index) => index));

  function save() {
    onsave({ hits, misses, ms: clock.read(), done });
  }

  function start() {
    clock.start();
    save();
    focus_tile(round.odd === 0 ? 1 : 0);
  }

  $effect(() => {
    if (!done && clock.running && left <= 0) finish();
  });

  function finish() {
    clock.pause();
    done = true;
    save();
    onfinish(ODD_MS, hits);
  }

  async function focus_tile(index: number) {
    cursor = Math.min(index, round.size * round.size - 1);
    await tick();
    board?.querySelector<HTMLButtonElement>(`[data-index="${cursor}"]`)?.focus({ preventScroll: true });
  }

  function pick(index: number) {
    if (done || !clock.running) return;
    if (index === round.odd) {
      hits++;
      flash = null;
    } else {
      misses++;
      flash = index;
    }
    if (remaining_ms(clock.read(), misses) <= 0) finish();
    else save();
    if (cursor >= round.size * round.size) cursor = 0;
  }

  $effect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => (flash = null), 350);
    return () => clearTimeout(timer);
  });

  function on_keydown(event: KeyboardEvent) {
    const index = Number((event.target as HTMLElement).dataset.index);
    if (Number.isNaN(index)) return;
    const moved = grid_key_move(event.key, index, round.size, round.size);
    if (moved === null) return;
    event.preventDefault();
    focus_tile(moved);
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  {#if done}
    <div class="m-auto flex w-full max-w-md flex-col items-center gap-4 p-4">
      <p class="text-center" aria-live="polite">
        <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">{daily ? "Today's odd one out" : "Odd one out"}</span>
        <span class="font-mono text-4xl font-semibold tabular-nums">{hits}</span>
        <span class="block text-ui text-foreground/65">found in a minute · {misses} {misses === 1 ? "miss" : "misses"}</span>
      </p>
      <ShareCard text={odd_share(head, hits, misses, link)} {next} />
    </div>
  {:else}
    <div class="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 font-mono text-ui tabular-nums">
      <span aria-live="polite">{hits} found</span>
      <span class={cn("rounded-full px-2.5 py-0.5", seconds <= 10 && started ? "bg-error/15 text-error" : "bg-foreground/8")}>0:{String(seconds).padStart(2, "0")}</span>
    </div>
    <div class="board-area relative grid min-h-0 flex-1 place-items-center p-3">
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        bind:this={board}
        role="grid"
        aria-label="Find the tile that's a different shade. Arrow keys move, Enter picks. A miss costs {MISS_PENALTY_MS / 1000} seconds"
        class="board relative grid gap-1 @sm:gap-1.5"
        style:grid-template-columns="repeat({round.size}, minmax(0, 1fr))"
        onkeydown={on_keydown}
      >
        {#each tiles as index (`${hits}:${index}`)}
          <button
            data-index={index}
            role="gridcell"
            tabindex={index === cursor ? 0 : -1}
            aria-label="Tile {index + 1}"
            disabled={!clock.running}
            class={cn(
              "aspect-square min-h-0 rounded-md ring-1 ring-foreground/10 transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail active:scale-95 disabled:cursor-default",
              flash === index && "miss"
            )}
            style:background-color={index === round.odd ? round.odd_color : round.base}
            onclick={() => pick(index)}
            onfocus={() => (cursor = index)}
          ></button>
        {/each}
        {#if !clock.running}
          <BoardOverlay
            class="-m-2 rounded-xl"
            title={started ? "Paused" : "Odd one out"}
            detail={started ? `${hits} found · ${seconds}s left` : `One tile is a different shade. ${ODD_MS / 1000} seconds; a miss costs ${MISS_PENALTY_MS / 1000}.`}
          >
            <Button variant="primary" onclick={start}>{started ? "Resume" : "Start"}</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .board-area {
    container-type: size;
  }

  .board {
    width: min(100cqw, 100cqh, 36rem);
    aspect-ratio: 1;
  }

  .miss {
    animation: miss 350ms var(--ease-out);
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }

  @keyframes miss {
    25%,
    75% {
      translate: -3px 0;
    }
    50% {
      translate: 3px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .miss {
      animation: none;
    }
  }
</style>
