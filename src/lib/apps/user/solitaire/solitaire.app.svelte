<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { daily_seed, format_time, Stopwatch, track_play } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ClockCounterClockwise as RestartIcon,
    ArrowsCounterClockwise as RecycleIcon,
    ArrowUUpLeft as UndoIcon,
    ChartBar as ChartBarIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { CardDrag } from "./drag.handler.svelte";
  import {
    apply,
    auto_step,
    best_target,
    can_auto_complete,
    can_move,
    card_name,
    deal,
    final_score,
    is_won,
    MoveKind,
    movable,
    pile,
    replay,
    suit_of,
    SUITS,
    type Draw,
    type Game,
    type Move,
    type PileId,
  } from "./klondike";
  import PlayingCard, { SUIT_ICONS } from "./playing-card.svelte";
  import {
    draw_schema,
    EMPTY_SAVE,
    empty_stats,
    record_played,
    record_win,
    save_file_schema,
    stats_key,
    stats_schema,
    to_saved,
    type Saved,
  } from "./save";

  const { daily: daily_prop, draw: draw_prop }: { daily?: string; draw?: Draw } = $props();
  const daily = untrack(() => daily_prop);
  const requested_draw = untrack(() => (daily ? undefined : draw_prop));

  const DRAW_OPTIONS = [
    { value: "1", label: "Draw 1" },
    { value: "3", label: "Draw 3" },
  ];
  const PILES: PileId[] = ["s", "w", "f0", "f1", "f2", "f3", "t0", "t1", "t2", "t3", "t4", "t5", "t6"];
  const CASCADE_STEP_MS = 70;
  const DRAW_MODES: Draw[] = [1, 3];
  const CASCADE = Array.from({ length: 13 }, (_, i) => SUITS.map((suit) => ({ suit, card: suit * 13 + 12 - i }))).flat();

  const { window_id, app_id, window: win, storage, achievements } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);
  const draw_pref = storage.persisted<Draw>("draw", 1, draw_schema);
  // Window state survives session restore, so a restored window doesn't deal its launch request again.
  const dealt = storage.window("dealt", false);
  // Declared before the save file: teardown runs in creation order, so the last elapsed time lands before it's released.
  $effect(() => () => persist());
  const save = storage.file(daily ? "daily.json" : "game.json", EMPTY_SAVE, save_file_schema);
  const watch = new Stopwatch(() => win.is_visible);
  const tracker = track_play(app_id, () => win.is_visible);
  const reduced_motion = matchMedia("(prefers-reduced-motion: reduce)");

  // The daily deal is Draw 1 for everyone, so times compare.
  const initial_draw: Draw = daily ? 1 : draw_pref.value;
  const initial_seed = daily ? daily_seed(daily, app_id) : random_seed();
  let seed = $state(initial_seed);
  let draw = $state<Draw>(initial_draw);
  let states = $state.raw<Game[]>([deal(initial_seed, initial_draw)]);
  let moves = $state.raw<Move[]>([]);
  let counted = $state(false);
  let loaded = $state(false);
  let result = $state<{ ms: number; score: number; best: boolean } | null>(null);
  let message = $state<string | null>(null);
  let show_stats = $state(false);
  let cursor = $state<{ pile: PileId; depth: number }>({ pile: "s", depth: 1 });
  let held = $state<{ from: PileId; count: number } | null>(null);
  let keyboard = $state(false);
  let celebrate = $state(false);

  const game = $derived(states[states.length - 1]);
  const won = $derived(is_won(game));
  const finishing = $derived(loaded && can_auto_complete(game));
  const entry = $derived(stats.value[stats_key(draw)]);
  const score = $derived(won && result ? result.score : game.score);
  const shown_ms = $derived(won && result ? result.ms : watch.elapsed);

  const drag = new CardDrag({
    can_pick: (from, count) => !won && count <= movable(game, from),
    can_drop: (from, to, count) => can_move(game, from, resolve(from, to, count), count),
    drop: (from, to, count) => {
      play({ kind: MoveKind.MOVE, from, to: resolve(from, to, count), count });
    },
    tap: (from, count) => auto_move(from, count),
  });

  const status = $derived.by(() => {
    if (!loaded) return "Loading the saved game";
    if (won) return `Solved in ${format_time(shown_ms)} and ${game.moves} moves${result?.best ? ", a new best" : ""}`;
    if (held) return `Holding ${describe(held.from, held.count)}: move to a pile, Space drops, Esc puts back`;
    if (message) return message;
    if (finishing) return "Every card is face up: finishing";
    if (!moves.length) return "Build each suit from ace to king; drag or tap a card to move it";
    return "Kings go on empty columns; tap the stock to draw";
  });

  $effect(() => {
    if (loaded || !save.ready) return;
    untrack(() => {
      const saved = save.value.game;
      const same_day = !daily || save.value.day === daily;
      if (saved && same_day && (daily || !saved.won)) restore(saved);
      loaded = true;
      persist();
      if (requested_draw && !dealt.value) {
        dealt.value = true;
        void deal_requested(requested_draw);
      }
    });
  });

  $effect(() => {
    if (!win.is_visible) untrack(persist);
  });

  $effect(() => {
    if (!finishing || !win.is_visible || drag.active) return;
    const move = auto_step(game);
    if (!move) return;
    const timer = setTimeout(
      () => play(move),
      reduced_motion.matches ? 0 : 110
    );
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `solitaire.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("new", "f2", "New game", () => (daily ? restart() : new_game())),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function resolve(from: PileId, to: PileId, count: number): PileId {
    if (to[0] !== "f") return to;
    const cards = pile(game, from);
    return `f${suit_of(cards[cards.length - count])}`;
  }

  function describe(from: PileId, count: number): string {
    const cards = pile(game, from);
    const name = card_name(cards[cards.length - count]);
    return count > 1 ? `${name} and ${count - 1} more` : name;
  }

  function restore(saved: Saved) {
    seed = saved.seed;
    draw = saved.draw;
    const replayed = replay(saved.seed, saved.draw, saved.moves);
    states = replayed;
    moves = saved.moves.slice(0, replayed.length - 1);
    counted = saved.counted;
    watch.reset(saved.elapsed);
    const done = is_won(replayed[replayed.length - 1]);
    result = done ? { ms: saved.elapsed, score: final_score(replayed[replayed.length - 1], saved.elapsed), best: false } : null;
    if (moves.length && !done) watch.start();
  }

  function persist() {
    if (!loaded) return;
    save.value = { version: 1, day: daily ?? null, game: to_saved(seed, draw, moves, watch.read(), counted, won) };
  }

  function play(move: Move): boolean {
    if (won || !loaded) return false;
    const next = apply(game, move);
    if (!next) return false;
    if (!watch.running) watch.start();
    if (!counted) {
      counted = true;
      stats.value = record_played(stats.value, draw);
    }
    states = [...states, next];
    moves = [...moves, move];
    message = null;
    if (is_won(next)) finish(next);
    persist();
    return true;
  }

  function finish(final: Game) {
    const ms = watch.pause();
    const total = final_score(final, ms);
    const best = entry.won > 0 && (entry.best_score === null || total > entry.best_score);
    result = { ms, score: total, best };
    celebrate = true;
    stats.value = record_win(stats.value, draw, ms, total);
    if (daily) tracker.daily(daily, ms);
    held = null;
    achievements.achieve("first-win");
    if (draw === 3) achievements.achieve("draw-3");
    if (daily) achievements.achieve("daily");
    if (ms < 120_000) achievements.achieve("fast");
    achievements.progress("wins-25", stats.value.draw1.won + stats.value.draw3.won);
  }

  function draw_card() {
    held = null;
    if (!play({ kind: MoveKind.DRAW })) message = won ? null : "The stock and waste are empty";
  }

  function auto_move(from: PileId, count: number) {
    if (won) return;
    const to = best_target(game, from, count);
    if (to) play({ kind: MoveKind.MOVE, from, to, count });
    else message = `Nowhere to put the ${describe(from, count)}`;
  }

  function undo() {
    if (!moves.length || won || finishing) return;
    states = states.slice(0, -1);
    moves = moves.slice(0, -1);
    held = null;
    message = null;
    persist();
  }

  function reset(next_seed: number, next_draw: Draw, keep_count: boolean) {
    seed = next_seed;
    draw = next_draw;
    states = [deal(next_seed, next_draw)];
    moves = [];
    counted = keep_count && counted;
    result = null;
    celebrate = false;
    held = null;
    message = null;
    cursor = { pile: "s", depth: 1 };
    watch.reset();
    persist();
  }

  async function confirm_discard(title: string, confirm_label: string): Promise<boolean> {
    if (!moves.length || won) return true;
    return win.confirm(title, { detail: "This game's progress is lost. Statistics stay.", confirm_label });
  }

  async function new_game() {
    if (await confirm_discard("Start a new game?", "New game")) reset(random_seed(), draw_pref.value, false);
  }

  async function deal_requested(next: Draw) {
    if (!(await confirm_discard("Start a new game?", "New game"))) return;
    draw_pref.value = next;
    reset(random_seed(), next, false);
  }

  async function restart() {
    if (await confirm_discard("Restart this deal?", "Restart")) reset(seed, draw, true);
  }

  async function set_draw(value: string) {
    const next: Draw = value === "3" ? 3 : 1;
    if (next === draw) return;
    if (!(await confirm_discard(`Switch to Draw ${next}?`, "Switch"))) return;
    draw_pref.value = next;
    reset(random_seed(), next, false);
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Games, wins, best times and best scores for both draw modes go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }

  function move_cursor(step: number) {
    const index = PILES.indexOf(cursor.pile);
    cursor = { pile: PILES[(index + step + PILES.length) % PILES.length], depth: 1 };
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    keyboard = true;
    const { pile: at, depth } = cursor;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move_cursor(-1),
      ArrowRight: () => move_cursor(1),
      ArrowUp: () => (cursor = { pile: at, depth: Math.min(depth + 1, Math.max(1, movable(game, at))) }),
      ArrowDown: () => (cursor = { pile: at, depth: Math.max(1, depth - 1) }),
      Escape: () => (held = null),
      d: draw_card,
      Enter: () => {
        if (at === "s") draw_card();
        else if (held) drop_held();
        else if (movable(game, at) >= depth) auto_move(at, depth);
      },
      " ": () => {
        if (at === "s") draw_card();
        else if (held) drop_held();
        else if (!won && movable(game, at) >= depth) held = { from: at, count: depth };
      },
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  }

  function drop_held() {
    if (!held) return;
    const to = resolve(held.from, cursor.pile, held.count);
    if (held.from === cursor.pile) held = null;
    else if (play({ kind: MoveKind.MOVE, from: held.from, to, count: held.count })) held = null;
    else message = `The ${describe(held.from, held.count)} doesn't go there`;
  }

  function lifted(from: PileId, depth: number): boolean {
    return drag.holds(from, depth) || (held?.from === from && depth <= held.count);
  }

  function at_cursor(id: PileId, depth: number): boolean {
    return keyboard && cursor.pile === id && cursor.depth === depth;
  }

  function slot_classes(id: PileId): string {
    return cn(
      "slot relative rounded-[calc(var(--w)*0.09)] outline-none",
      drag.over === id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      keyboard && cursor.pile === id && pile(game, id).length === 0 && "ring-2 ring-cottontail",
      pile(game, id).length > 0 && "border-transparent"
    );
  }

</script>

{#snippet card_at(id: PileId, card: number, up: boolean, depth: number, extra: string = "")}
  {@const is_lifted = up && lifted(id, depth)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      "card absolute top-0 left-0 h-(--h) w-(--w) touch-none",
      up && !won && "cursor-grab",
      is_lifted && "lifted",
      is_lifted && drag.active && "dragging",
      at_cursor(id, depth) && "rounded-[calc(var(--w)*0.09)] ring-2 ring-cottontail",
      extra
    )}
    style:translate={is_lifted && drag.active ? `${drag.dx}px ${drag.dy}px` : undefined}
    onpointerdown={up ? (event) => ((keyboard = false), drag.start(event, id, depth)) : undefined}
  >
    <PlayingCard {card} {up} />
  </div>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {#if daily}
      <span class="px-1.5 text-ui font-medium">Daily · {daily}</span>
    {:else}
      <Segmented size="sm" class="hidden @lg:inline-flex" label="Draw" options={DRAW_OPTIONS} bind:value={() => String(draw), set_draw} />
      <Select class="w-26 @lg:hidden" size="sm" aria-label="Draw" options={DRAW_OPTIONS} bind:value={() => String(draw), set_draw} />
    {/if}
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!moves.length || won || finishing} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Restart this deal" disabled={!moves.length} onclick={restart}>
      <RestartIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    {#if !daily}
      <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
    {/if}
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class={cn("felt relative min-h-0 overflow-hidden select-none [-webkit-touch-callout:none]", !win.is_visible && "paused")}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        data-board
        role="application"
        tabindex="0"
        aria-label="Solitaire. Arrows pick a pile, Up and Down pick how many cards, Enter moves them to the best place, Space picks up and drops, D draws"
        class="layout rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cottontail/60 focus-visible:ring-inset"
        onkeydown={on_keydown}
        onpointerdown={() => (keyboard = false)}
        onblur={() => (held = null)}
      >
        <button
          type="button"
          class={cn("stock grid place-items-center border border-dashed border-foreground/20 text-foreground/40", slot_classes("s"))}
          style:grid-area="s"
          aria-label={game.stock.length ? `Stock, ${game.stock.length} cards: draw` : game.waste.length ? "Turn the waste over" : "Stock empty"}
          tabindex="-1"
          onclick={draw_card}
        >
          {#if game.stock.length}
            <span class={cn("absolute inset-0", at_cursor("s", 1) && "rounded-[calc(var(--w)*0.09)] ring-2 ring-cottontail")}>
              <PlayingCard card={game.stock[game.stock.length - 1]} up={false} />
            </span>
          {:else if game.waste.length}
            <RecycleIcon weight="bold" class="size-[calc(var(--w)*0.36)]" />
          {/if}
        </button>

        <div class={cn(slot_classes("w"), "waste")} style:grid-area="w">
          {#each game.waste.slice(draw === 3 ? -3 : -2) as card, i (card)}
            {@const shown = Math.min(game.waste.length, draw === 3 ? 3 : 2)}
            {@const depth = shown - i}
            <div class="contents" style:--fan={draw === 3 ? i : 0}>
              {@render card_at("w", card, true, depth, depth > 1 ? "pointer-events-none fan" : "fan")}
            </div>
          {/each}
        </div>

        {#each game.foundations as cards, index (index)}
          {@const id: PileId = `f${index}`}
          {@const Icon = SUIT_ICONS[SUITS[index]]}
          <div class={cn("foundation grid place-items-center border border-dashed border-foreground/20", slot_classes(id))} style:grid-area={id} data-drop={id}>
            <Icon weight="fill" class="size-[calc(var(--w)*0.4)] text-foreground/15" />
            {#each cards.slice(-2) as card, i (card)}
              {@render card_at(id, card, true, Math.min(cards.length, 2) - i)}
            {/each}
          </div>
        {/each}

        {#each game.tableau as column, index (index)}
          {@const id: PileId = `t${index}`}
          <div class="column relative" style:grid-area={id} style:--down={column.hidden} style:--up={column.cards.length - column.hidden} data-drop={id}>
            <div class={cn("h-(--h) border border-dashed border-foreground/15", slot_classes(id))}></div>
            {#each column.cards as card, i (card)}
              <div class="contents" style:--i={i}>
                {@render card_at(id, card, i >= column.hidden, column.cards.length - i, "stacked")}
              </div>
            {/each}
          </div>
        {/each}
      </div>

      {#if !loaded}
        <div class="absolute inset-0 grid place-items-center bg-background/60"><Spinner /></div>
      {/if}

      {#if won && celebrate}
        <div class="cascade pointer-events-none absolute inset-0" aria-hidden="true">
          {#each CASCADE as item, i (item.card)}
            <div class="fly" style:z-index={CASCADE.length - i} style:--slot={3 + item.suit} style:--delay="{i * CASCADE_STEP_MS}ms" style:--drift={(i % 2 ? -1 : 1) * (0.35 + ((i * 37) % 10) / 16)}>
              <div class="fly-y">
                <PlayingCard card={item.card} up={true} />
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if won}
        <div class="reveal absolute inset-0" style:--after="{celebrate ? CASCADE.length * CASCADE_STEP_MS : 0}ms">
          <BoardOverlay
            class="bg-background/55"
            title={result?.best ? "New best score" : "You won"}
            detail="Score {score} · {format_time(shown_ms)} · {game.moves} moves{entry.best_score !== null ? ` · Best ${entry.best_score}` : ''}"
          >
            {#if daily}
              <Button size="sm" variant="primary" onclick={() => reset(seed, draw, true)}>Play again</Button>
            {:else}
              <Button size="sm" onclick={() => reset(seed, draw, true)}>Replay deal</Button>
              <Button size="sm" variant="primary" onclick={() => reset(random_seed(), draw_pref.value, false)}>New game</Button>
            {/if}
          </BoardOverlay>
        </div>
      {/if}
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-foreground/8 @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-60 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @5xl:hidden" />
      <Section title="Statistics" description="Games started and won per draw mode. Best score includes the time bonus.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each DRAW_MODES as mode (mode)}
          {@const each = stats.value[stats_key(mode)]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", mode === draw ? "font-medium" : "text-foreground/80")}>Draw {mode}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Won {each.won}/{each.played}{each.played ? ` (${Math.round((each.won / each.played) * 100)}%)` : ""}
            </span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              {each.best_ms === null ? "No wins yet" : `Best ${format_time(each.best_ms)} · ${each.best_score ?? 0} pts`}
            </span>
          </div>
        {/each}
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0 tabular-nums">Score {score}</span>
    <span class="shrink-0 tabular-nums">Moves {game.moves}</span>
    <span class="shrink-0 tabular-nums">{format_time(shown_ms)}</span>
    <span class="hidden font-sans @xl:inline" aria-live="polite">{status}</span>
  </StatusBar>
</div>

<style>
  .felt {
    container-type: size;
    touch-action: none;
  }

  .layout {
    --pad: clamp(0.375rem, 2cqw, 1rem);
    --gap: clamp(0.25rem, 1.2cqw, 0.75rem);
    --w: min((100cqw - 2 * var(--pad) - 6 * var(--gap)) / 7, (100cqh - 2 * var(--pad) - var(--gap)) / 3.6, 7rem);
    --h: calc(var(--w) * 1.4);
    --fd: calc(var(--h) * 0.1);
    --fu: calc(var(--h) * 0.27);
    --rows: calc(100cqh - 2 * var(--pad) - var(--h) - var(--gap));
    display: grid;
    grid-template-columns: repeat(7, var(--w));
    grid-template-rows: var(--h) var(--rows);
    grid-template-areas:
      "s w . f0 f1 f2 f3"
      "t0 t1 t2 t3 t4 t5 t6";
    gap: var(--gap);
    justify-content: center;
    height: 100%;
    padding: var(--pad);
  }

  .slot {
    height: var(--h);
  }

  .column {
    --step: clamp(var(--h) * 0.15, (var(--rows) - var(--h) - var(--down) * var(--fd)) / max(var(--up) - 1, 1), var(--fu));
  }

  .stacked {
    top: calc(min(var(--i), var(--down)) * var(--fd) + max(var(--i) - var(--down), 0) * var(--step));
  }

  .fan {
    top: 0;
    left: calc(var(--fan) * var(--w) * 0.28);
  }

  .lifted {
    z-index: 40;
  }

  .lifted:not(.dragging) {
    translate: 0 calc(var(--w) * -0.08);
  }

  .dragging {
    z-index: 50;
    pointer-events: none;
    cursor: grabbing;
    filter: drop-shadow(0 0.5rem 0.75rem color-mix(in oklab, var(--background-darkest) 45%, transparent));
  }

  .cascade {
    padding: var(--pad);
    --pad: clamp(0.375rem, 2cqw, 1rem);
    --gap: clamp(0.25rem, 1.2cqw, 0.75rem);
    --w: min((100cqw - 2 * var(--pad) - 6 * var(--gap)) / 7, (100cqh - 2 * var(--pad) - var(--gap)) / 3.6, 7rem);
    --h: calc(var(--w) * 1.4);
    z-index: 55;
  }

  .fly {
    position: absolute;
    top: var(--pad);
    left: calc(50cqw - 3.5 * var(--w) - 3 * var(--gap) + var(--slot) * (var(--w) + var(--gap)));
    width: var(--w);
    height: var(--h);
    animation: fly-x 2.6s linear var(--delay) both;
  }

  .fly-y {
    height: 100%;
    animation: fly-y 2.6s var(--delay) both;
  }

  .reveal {
    z-index: 56;
    animation: reveal 300ms var(--ease-out) var(--after) both;
  }

  .paused :is(.fly, .fly-y, .reveal) {
    animation-play-state: paused;
  }

  @keyframes fly-x {
    from {
      translate: 0 0;
    }
    to {
      translate: calc(var(--drift) * 100cqw) 0;
    }
  }

  @keyframes fly-y {
    0% {
      translate: 0 0;
      animation-timing-function: ease-in;
    }
    38% {
      translate: 0 calc(100cqh - var(--h) - 2 * var(--pad));
      animation-timing-function: ease-out;
    }
    58% {
      translate: 0 calc((100cqh - var(--h)) * 0.45);
      animation-timing-function: ease-in;
    }
    74% {
      translate: 0 calc(100cqh - var(--h) - 2 * var(--pad));
      animation-timing-function: ease-out;
    }
    86% {
      translate: 0 calc((100cqh - var(--h)) * 0.75);
      animation-timing-function: ease-in;
    }
    100% {
      translate: 0 calc(100cqh - var(--h) - 2 * var(--pad));
    }
  }

  @keyframes reveal {
    from {
      opacity: 0;
      visibility: hidden;
    }
    to {
      opacity: 1;
      visibility: visible;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cascade {
      display: none;
    }

    .reveal {
      animation: none;
    }
  }
</style>
