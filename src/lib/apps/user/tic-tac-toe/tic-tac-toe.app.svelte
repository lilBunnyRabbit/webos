<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowUUpLeft as UndoIcon, Circle as CircleIcon, X as XIcon } from "phosphor-svelte";
  import {
    board_from,
    choose_move,
    CELLS,
    empty_stats,
    Mark,
    Mode,
    MODES,
    mode_schema,
    result_of,
    stats_schema,
    step,
    turn_of,
    undo_count,
    type Tally,
  } from "./game";

  const MODE_LABELS: Record<Mode, string> = {
    easy: "Easy",
    medium: "Medium",
    impossible: "Impossible",
    local: "2 players",
  };
  const MODE_OPTIONS = MODES.map((value) => ({ value, label: MODE_LABELS[value] }));
  const COMPUTER_DELAY_MS = 350;

  const { window: win, storage } = get_app_context();
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // Per window, so two open games don't switch each other's mode; storage only remembers the last pick.
  let mode = $state<Mode>(storage.get("mode", mode_schema) ?? Mode.MEDIUM);
  let moves = $state<number[]>([]);
  let active = $state(4);
  const cell_elements: HTMLButtonElement[] = [];

  const vs_computer = $derived(mode !== Mode.LOCAL);
  const board = $derived(board_from(moves));
  const result = $derived(result_of(board));
  const turn = $derived(turn_of(moves));
  const computer_turn = $derived(vs_computer && turn === Mark.O && !result);
  const can_undo = $derived(!result && undo_count(moves, vs_computer) > 0);

  const status = $derived.by(() => {
    if (result) {
      if (result.winner === null) return "Draw";
      if (!vs_computer) return `${result.winner.toUpperCase()} wins`;
      return result.winner === Mark.X ? "You win" : "You lose";
    }
    if (!vs_computer) return `${turn.toUpperCase()} to move`;
    return computer_turn ? "Thinking…" : "Your turn";
  });

  $effect(() => {
    if (!computer_turn || mode === Mode.LOCAL) return;
    const difficulty = mode;
    const timer = setTimeout(() => play(choose_move(board, Mark.O, difficulty)), COMPUTER_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function play(cell: number) {
    if (result || board[cell] !== null) return;
    moves.push(cell);
    const outcome = result_of(board_from(moves));
    if (outcome) record(outcome.winner);
  }

  function record(winner: Mark | null) {
    const tally = stats.value[mode];
    if (winner === null) tally.draws++;
    else tally[winner]++;
  }

  function play_human(cell: number) {
    if (computer_turn) return;
    active = cell;
    play(cell);
  }

  function undo() {
    if (!can_undo) return;
    moves.splice(moves.length - undo_count(moves, vs_computer));
  }

  function new_game() {
    moves = [];
  }

  function set_mode(next: Mode) {
    mode = next;
    storage.set("mode", next);
    new_game();
  }

  function focus_cell(cell: number) {
    active = cell;
    cell_elements[cell]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    focus_cell(step(active, event.key));
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      return;
    }
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= CELLS) {
      event.preventDefault();
      focus_cell(digit - 1);
      play_human(digit - 1);
    }
  }

  function format_tally(for_mode: Mode, tally: Tally): string {
    return for_mode === Mode.LOCAL
      ? `X ${tally.x} · O ${tally.o} · Draws ${tally.draws}`
      : `Won ${tally.x} · Lost ${tally.o} · Draws ${tally.draws}`;
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Wins, losses and draws for every mode go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented
      class="hidden @lg:inline-flex"
      label="Mode"
      options={MODE_OPTIONS}
      bind:value={() => mode, set_mode}
    />
    <Select
      class="w-32 @lg:hidden"
      size="sm"
      aria-label="Mode"
      options={MODE_OPTIONS}
      bind:value={() => mode, set_mode}
    />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!can_undo} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
  </Toolbar>

  <div class="grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col items-center gap-3 p-4">
      <p class="text-sm font-semibold" aria-live="polite">{status}</p>

      <div class="grid w-full flex-1 place-items-center [container-type:size]">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="grid"
          aria-label="Tic-tac-toe board"
          tabindex="-1"
          class="grid size-[96cqmin] grid-cols-3 grid-rows-3 gap-[2.5cqmin]"
          onkeydown={on_board_keydown}
        >
          {#each [0, 1, 2] as row (row)}
            <div role="row" class="contents">
              {#each [0, 1, 2] as col (col)}
                {@const cell = row * 3 + col}
                {@const mark = board[cell]}
                {@const winning = result?.line.includes(cell) ?? false}
                <button
                  bind:this={cell_elements[cell]}
                  type="button"
                  role="gridcell"
                  tabindex={cell === active ? 0 : -1}
                  aria-label={`Cell ${cell + 1}, ${mark ? mark.toUpperCase() : "empty"}`}
                  aria-disabled={!!mark || !!result || computer_turn}
                  onclick={() => play_human(cell)}
                  onfocus={() => (active = cell)}
                  class={cn(
                    "grid place-items-center rounded-[3cqmin] bg-background-light ring-1 ring-foreground/8 transition-[background-color,opacity,box-shadow] duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail",
                    !mark && !result && !computer_turn && "cursor-pointer hover:bg-foreground/8",
                    result && !winning && "opacity-38",
                    winning && "bg-primary/12 ring-2 ring-primary"
                  )}
                >
                  {#if mark === Mark.X}
                    <XIcon weight="bold" class="size-[60%] text-primary" />
                  {:else if mark === Mark.O}
                    <CircleIcon weight="bold" class="size-[55%] text-secondary" />
                  {/if}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <aside class="hidden overflow-auto border-l border-foreground/8 p-4 @3xl:block">
      <Section title="Statistics" description="Every finished game, per mode.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each MODES as each_mode (each_mode)}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each_mode === mode ? "font-medium" : "text-foreground/80")}>
              {MODE_LABELS[each_mode]}
            </span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              {format_tally(each_mode, stats.value[each_mode])}
            </span>
          </div>
        {/each}
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span>{MODE_LABELS[mode]}</span>
    <span>{format_tally(mode, stats.value[mode])}</span>
    <span class="hidden @md:inline">Arrows + Enter or 1–9 to play</span>
  </StatusBar>
</div>
