<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$lib/core/games";
  import { BoardOverlay, Button, IconButton, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowUUpLeft as UndoIcon } from "phosphor-svelte";
  import { z } from "zod";
  import { can_move, new_game, play, saved_schema, shows_win, SIZE, WIN_VALUE, type Direction, type Game, type Tile } from "./game";
  import { key_direction, swipe_direction } from "$lib/core/games/direction";

  const SWIPE_THRESHOLD_PX = 24;
  const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => ({ row: Math.floor(i / SIZE), col: i % SIZE }));

  const { app_id, window_id, window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  $effect(() => shortcuts.register({ id: "twenty-forty-eight.undo", keys: "mod+z", label: "Undo", category: ShortcutCategory.APP, window: window_id, run: undo }));
  track_play(app_id, () => win.is_visible);
  const best = storage.persisted("best", 0, z.number().int().nonnegative());

  // Per window, so two open games don't play each other; storage keeps the last one touched for next time.
  const saved = storage.get("game", saved_schema);
  let game = $state.raw<Game>(saved?.game ?? new_game(Math.random));
  let previous = $state.raw<Game | null>(saved?.previous ?? null);
  let last = $state.raw<{ consumed: Tile[]; merged: Set<number>; spawned: number | null } | null>(null);
  let swipe: { pointer: number; x: number; y: number } | null = null;
  let root: HTMLDivElement;

  const over = $derived(!can_move(game));
  const winning = $derived(shows_win(game));
  const highest = $derived(Math.max(0, ...game.tiles.map((tile) => tile.value)));
  const rendered = $derived([...(last?.consumed ?? []), ...game.tiles]);

  const status = $derived.by(() => {
    if (winning) return `You reached ${WIN_VALUE}`;
    if (over) return "No moves left";
    return `Highest tile ${highest}`;
  });

  const board_label = $derived(
    Array.from({ length: SIZE }, (_, row) =>
      Array.from(
        { length: SIZE },
        (_, col) => game.tiles.find((tile) => tile.row === row && tile.col === col)?.value ?? "empty"
      ).join(", ")
    ).join("; ")
  );

  $effect(() => {
    root.focus({ preventScroll: true });
  });

  function commit(next: Game, next_previous: Game | null) {
    game = next;
    previous = next_previous;
    if (next.score > best.value) best.value = next.score;
    storage.set("game", { game: next, previous: next_previous });
  }

  function step(direction: Direction) {
    if (winning || over) return;
    const result = play(game, direction, Math.random);
    if (!result.moved) return;
    last = { consumed: result.consumed, merged: new Set(result.merged_ids), spawned: result.spawned_id };
    commit(result.game, game);
  }

  function undo() {
    if (!previous) return;
    last = null;
    commit(previous, null);
  }

  function keep_going() {
    commit({ ...game, keep_going: true }, previous);
    root.focus({ preventScroll: true });
  }

  async function start_over() {
    if (game.score > 0 && !over && !winning) {
      const confirmed = await win.confirm("Start a new game?", {
        detail: `The current game, with a score of ${game.score}, is lost. Your best score stays.`,
        confirm_label: "New game",
      });
      if (!confirmed) return;
    }
    last = null;
    commit(new_game(Math.random), null);
    root.focus({ preventScroll: true });
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const direction = key_direction(event.code);
    if (!direction) return;
    event.preventDefault();
    step(direction);
  }

  function on_pointerdown(event: PointerEvent) {
    // Capturing over the end screen would retarget its buttons' clicks to the board.
    if (!event.isPrimary || event.button !== 0 || winning || over) return;
    swipe = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointerup(event: PointerEvent) {
    if (!swipe || swipe.pointer !== event.pointerId) return;
    const direction = swipe_direction(event.clientX - swipe.x, event.clientY - swipe.y, SWIPE_THRESHOLD_PX);
    swipe = null;
    if (direction) step(direction);
  }

  // Tints pair with their own colour as ink and solids with text-background, so every step keeps its contrast in both themes.
  function tile_class(value: number): string {
    switch (value) {
      case 2:
        return "bg-foreground/8 text-foreground";
      case 4:
        return "bg-foreground/16 text-foreground";
      case 8:
        return "bg-tertiary/18 text-tertiary";
      case 16:
        return "bg-tertiary text-background";
      case 32:
        return "bg-secondary/18 text-secondary";
      case 64:
        return "bg-secondary text-background";
      case 128:
        return "bg-accent/18 text-accent";
      case 256:
        return "bg-accent text-background";
      case 512:
        return "bg-primary/18 text-primary";
      case 1024:
        return "bg-primary/35 text-primary";
      case 2048:
        return "bg-primary text-background";
      default:
        return "bg-foreground text-background";
    }
  }

  function text_class(value: number): string {
    const digits = String(value).length;
    if (digits <= 2) return "text-[9cqw]";
    if (digits === 3) return "text-[7.5cqw]";
    if (digits === 4) return "text-[6cqw]";
    return "text-[4.75cqw]";
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} tabindex="-1" class="grid h-full grid-rows-[auto_1fr_auto] outline-none" onkeydown={on_keydown}>
  <Toolbar>
    <div class="flex flex-col px-2">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Score</span>
      <span class="font-mono text-sm font-semibold tabular-nums">{game.score}</span>
    </div>
    <div class="flex flex-col px-2">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Best</span>
      <span class="font-mono text-sm font-semibold tabular-nums">{best.value}</span>
    </div>
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!previous} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <Button size="sm" variant="primary" onclick={start_over}>New game</Button>
  </Toolbar>

  <div class="grid min-h-0 place-items-center p-4 [container-type:size]">
    <div
      role="img"
      aria-label={`Board: ${board_label}`}
      class="board relative size-[96cqmin] touch-none rounded-[3cqmin] bg-foreground/6 select-none [container-type:size]"
      onpointerdown={on_pointerdown}
      onpointerup={on_pointerup}
      onlostpointercapture={() => (swipe = null)}
    >
      {#each CELLS as cell (cell.row * SIZE + cell.col)}
        <div class="cell rounded-[2cqw] bg-foreground/5" style:--row={cell.row} style:--col={cell.col}></div>
      {/each}

      {#each rendered as tile (tile.id)}
        {@const merged = last?.merged.has(tile.id) ?? false}
        {@const spawned = last?.spawned === tile.id}
        <div
          class={cn("cell tile", game.tiles.includes(tile) ? "z-10" : "consumed z-0")}
          style:--row={tile.row}
          style:--col={tile.col}
        >
          <div
            class={cn(
              "grid size-full place-items-center rounded-[2cqw] font-mono leading-none font-bold tabular-nums",
              tile_class(tile.value),
              text_class(tile.value),
              merged && "pop",
              spawned && "appear"
            )}
          >
            {tile.value}
          </div>
        </div>
      {/each}

      {#if winning || over}
        <BoardOverlay class="z-20 rounded-[3cqmin]" title={winning ? `You reached ${WIN_VALUE}` : "Game over"} detail="Score {game.score} · Best {best.value}">
          {#if winning}
            <Button size="sm" variant="quiet" onclick={start_over}>New game</Button>
            <Button size="sm" variant="primary" onclick={keep_going}>Keep going</Button>
          {:else}
            <Button size="sm" variant="quiet" disabled={!previous} onclick={undo}>Undo</Button>
            <Button size="sm" variant="primary" onclick={start_over}>New game</Button>
          {/if}
        </BoardOverlay>
      {/if}
    </div>
  </div>

  <StatusBar>
    <span>{status}</span>
    <span class="hidden @md:inline">Arrows or WASD to move, swipe on touch</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 3cqw;
    --cell: calc((100cqw - 5 * var(--gap)) / 4);
  }

  .cell {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--cell);
    height: var(--cell);
    transform: translate(
      calc(var(--gap) + var(--col) * (var(--cell) + var(--gap))),
      calc(var(--gap) + var(--row) * (var(--cell) + var(--gap)))
    );
  }

  .tile {
    transition: transform 100ms var(--ease-in-out);
  }

  /* Tiles merged away vanish once they've slid under the merged tile, so a tint never shows their value through it. */
  .consumed {
    animation: tile-consumed 1ms 100ms forwards;
  }

  @keyframes tile-consumed {
    to {
      opacity: 0;
    }
  }

  /* New tiles wait for the slide to finish, so they never show up on top of a tile still moving. */
  .appear {
    animation: tile-appear 160ms var(--ease-out) 100ms backwards;
  }

  .pop {
    animation: tile-pop 200ms var(--ease-out) 100ms backwards;
  }

  @keyframes tile-appear {
    from {
      scale: 0;
      opacity: 0;
    }
  }

  @keyframes tile-pop {
    0% {
      scale: 0.6;
    }
    55% {
      scale: 1.12;
    }
    100% {
      scale: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }

    .appear,
    .pop {
      animation: none;
    }

    .consumed {
      animation: none;
      opacity: 0;
    }
  }
</style>
