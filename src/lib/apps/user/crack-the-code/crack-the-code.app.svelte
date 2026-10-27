<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { Badge, BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { Backspace as BackspaceIcon, ChartBar as ChartBarIcon, PaperPlaneTilt as PaperPlaneTiltIcon, Stamp as StampIcon } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    best_matches,
    daily_game,
    daily_saved_schema,
    declassify,
    empty_stats,
    guess,
    Length,
    length_schema,
    LENGTHS,
    new_game,
    record,
    restore,
    saved_schema,
    stats_schema,
    Status,
    to_saved,
    type Game,
  } from "./game";
  import { Flash } from "$kit/utils/flash.svelte";

  const LENGTH_OPTIONS = LENGTHS.map((value) => ({ value, label: `${value} digits` }));
  const PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage, achievements } = get_app_context();
  const tracker = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // A daily case saves under its own key, so it never replaces the regular one.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  let game = $state.raw<Game>(
    restored ?? (daily_day ? daily_game(daily_day) : new_game(storage.get("length", length_schema) ?? Length.L4, random_seed()))
  );
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  if (restored?.status === Status.PLAYING && restored.guesses.length) clock.start();
  let typed = $state<number[]>([]);
  const flash = new Flash(1800);
  let shake = $state(false);
  let show_stats = $state(false);
  let root = $state<HTMLDivElement>();
  let board = $state<HTMLDivElement>();

  const length = $derived(game.secret.length);
  const over = $derived(game.status !== Status.PLAYING);
  const used = $derived(game.guesses.length);
  const log = $derived(game.guesses.map((entry, index) => ({ ...entry, number: index + 1 })).reverse());
  const best = $derived(best_matches(game));
  const elapsed = $derived(clock.elapsed);
  const entry = $derived(stats.value[game.length]);
  const slots = $derived(over ? game.secret : Array.from({ length }, (_, index) => typed[index] ?? null));
  const opened = $derived(
    new Date(daily ? `${daily}T12:00:00` : Date.now()).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
  );

  const stamp = $derived.by(() => {
    if (game.status === Status.CRACKED) return { label: "Cracked", tone: "success" } as const;
    if (game.status === Status.DECLASSIFIED) return { label: "Declassified", tone: "error" } as const;
    return { label: daily ? "Daily case" : "Active", tone: "primary" } as const;
  });

  const status = $derived.by(() => {
    if (flash.text) return flash.text;
    if (game.status === Status.CRACKED) return `Cracked in ${guesses(used)}`;
    if (game.status === Status.DECLASSIFIED) return "Declassified. The code is on file";
    const last = game.guesses.at(-1);
    if (last) return `${last.matches} of ${length} in place`;
    return `${length} distinct digits. Each guess tells how many sit in the right place`;
  });

  const overlay = $derived.by(() => {
    if (game.status === Status.CRACKED)
      return { title: daily ? "Daily case cracked" : "Code cracked", detail: `${guesses(used)} · ${format_time(elapsed)}${entry.best !== null ? ` · best ${entry.best}` : ""}` };
    if (game.status === Status.DECLASSIFIED) return { title: "Case declassified", detail: `${guesses(used)} logged · not counted` };
    return null;
  });

  function guesses(count: number): string {
    return `${count} ${count === 1 ? "guess" : "guesses"}`;
  }

  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `crack-the-code.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const dispose = scoped("new", "f2", "New case", () => start_over());
    return () => dispose();
  });

  $effect(() => {
    if (!shake) return;
    const timer = setTimeout(() => (shake = false), 400);
    return () => clearTimeout(timer);
  });

  function save() {
    const data = to_saved(game, clock.read());
    if (daily) storage.set("daily", { day: daily, game: data });
    else storage.set("game", data);
  }
  onDestroy(save);

  function press(digit: number) {
    if (over || typed.length >= length) return;
    typed = [...typed, digit];
  }

  function erase() {
    if (!over) typed = typed.slice(0, -1);
  }

  function transmit() {
    if (over) return;
    if (typed.length < length) {
      flash.show(`Enter all ${length} digits`);
      shake = true;
      return;
    }
    if (!clock.running) clock.start();
    game = guess(game, typed);
    typed = [];
    flash.clear();
    if (game.status === Status.CRACKED) finish();
    save();
  }

  function finish() {
    const ms = clock.pause();
    stats.value = record(stats.value, game.length, used, ms);
    if (daily) tracker.daily(daily, ms, used);
    achievements.achieve("first-crack");
    if (daily) achievements.achieve("daily");
    if (game.length === Length.L7) achievements.achieve("seven");
    if (Number(game.length) >= 4 && used <= 5) achievements.achieve("hunch");
    achievements.progress("cracks-25", Object.values(stats.value).reduce((sum, entry) => sum + entry.solved, 0));
  }

  async function give_up() {
    if (over) return;
    const confirmed = await win.confirm("Declassify the code?", {
      detail: "The code is revealed and this case doesn't count in the statistics.",
      confirm_label: "Declassify",
      danger: true,
    });
    if (!confirmed) return;
    clock.pause();
    game = declassify(game);
    typed = [];
    save();
  }

  async function start_over(next: Length = game.length) {
    if (!over && used > 0) {
      const confirmed = await win.confirm("Open a new case?", {
        detail: "This case and its intercept log are lost. Statistics stay.",
        confirm_label: "New case",
      });
      if (!confirmed) return;
    }
    daily = null;
    storage.set("length", next);
    game = new_game(next, random_seed());
    typed = [];
    flash.clear();
    clock.reset();
    save();
    board?.focus({ preventScroll: true });
  }

  function set_length(next: Length) {
    if (next !== game.length || daily) start_over(next);
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("input:not([type=radio]), select, textarea")) return;
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1];
    if (digit !== undefined) {
      event.preventDefault();
      press(Number(digit));
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      erase();
    } else if (event.key === "Enter" && !target.closest("button")) {
      event.preventDefault();
      transmit();
    }
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Cases cracked, fewest guesses and best times for every length go back to zero. The case in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }

  // Pad keys never take focus, so Enter typed after a tap still transmits instead of pressing the key again.
  function keep_focus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

{#snippet digit_tile(digit: number | null, tone: string, size: "lg" | "sm")}
  <span
    class={cn(
      "grid place-items-center rounded-md font-mono font-semibold tabular-nums ring-1 ring-inset",
      size === "lg" ? "slot text-[calc(var(--slot)*0.5)]" : "size-6 text-sm @sm:size-7 @sm:text-base @md:size-8 @md:text-lg",
      tone
    )}>{digit ?? ""}</span
  >
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Code length" options={LENGTH_OPTIONS} bind:value={() => game.length, set_length} />
    <Select class="w-28 @2xl:hidden" size="sm" aria-label="Code length" options={LENGTH_OPTIONS} bind:value={() => game.length, set_length} />
    <div class="flex-1"></div>
    <Button size="sm" variant="quiet" class="hidden @md:inline-flex" disabled={over} onclick={give_up}>
      <StampIcon weight="bold" />Declassify
    </Button>
    <IconButton size="sm" label="Declassify" class="@md:hidden" disabled={over} onclick={give_up}>
      <StampIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={() => start_over()}>New case</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={board}
      role="application"
      tabindex="0"
      aria-label="Case {game.case_number}, a {length} digit code. Type digits, Enter to transmit, Backspace to delete"
      class="mx-auto flex min-h-0 w-full max-w-xl flex-col gap-3 px-3 pt-3 pb-3 overflow-auto outline-none touch-manipulation [container-type:inline-size]"
    >
      <header class="flex shrink-0 items-start justify-between gap-3 rounded-lg border border-dashed border-foreground/20 px-3 py-2">
        <div class="min-w-0">
          <p class="text-2xs tracking-[0.2em] text-foreground/65 uppercase">Case file</p>
          <p class="truncate font-mono text-base font-semibold tracking-wider">{game.case_number}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={stamp.tone} class="-rotate-3 tracking-[0.15em] uppercase ring-1 ring-current/40">{stamp.label}</Badge>
          <p class="font-mono text-2xs text-foreground/65 uppercase tabular-nums">Opened {opened}</p>
        </div>
      </header>

      <section class="flex min-h-20 flex-1 flex-col gap-1.5" aria-label="Intercept log">
        <div class="flex shrink-0 items-baseline justify-between gap-2 text-2xs text-foreground/65">
          <h2 class="tracking-[0.2em] uppercase">Intercept log</h2>
          <span class="font-mono tabular-nums">best {best}/{length} · latest first</span>
        </div>
        <ol class="min-h-0 flex-1 overflow-auto rounded-lg bg-background-light ring-1 ring-foreground/8">
          {#each log as row (row.number)}
            {@const perfect = row.matches === length}
            <li class={cn("flex items-center gap-3 border-b border-dashed border-foreground/10 px-3 py-2 last:border-b-0", row.number === used && "bg-primary/6")}>
              <span class="w-9 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">#{String(row.number).padStart(3, "0")}</span>
              <span class="flex gap-1">
                {#each row.digits as digit, index (index)}
                  {@render digit_tile(digit, perfect ? "bg-success/15 text-success ring-success/40" : "bg-background ring-foreground/15", "sm")}
                {/each}
              </span>
              <span class="ml-auto flex items-center gap-2" aria-label="{row.matches} of {length} in place">
                <span class="hidden gap-1 @sm:flex" aria-hidden="true">
                  {#each { length }, index (index)}
                    <span class={cn("size-2.5 rounded-full ring-1 ring-inset", index < row.matches ? (perfect ? "bg-success ring-success" : "bg-primary ring-primary") : "ring-foreground/25")}></span>
                  {/each}
                </span>
                <span class={cn("font-mono text-sm font-semibold tabular-nums", row.matches === 0 ? "text-foreground/50" : perfect ? "text-success" : "text-primary")}>
                  {row.matches}<span class="text-2xs font-normal text-foreground/50">/{length}</span>
                </span>
              </span>
            </li>
          {:else}
            <li class="grid h-full min-h-24 place-items-center p-4 text-center">
              <span>
                <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">No transmissions yet</span>
                <span class="mt-1 block text-ui text-foreground/65">Enter a guess below to start the trace.</span>
              </span>
            </li>
          {/each}
        </ol>
      </section>

      <div class="entry flex shrink-0 justify-center gap-1.5" class:shake style:--len={length} aria-label="Guess" role="group">
        {#each slots as digit, index (index)}
          {@render digit_tile(
            digit,
            cn(
              over && game.status === Status.CRACKED && "bg-success/15 text-success ring-success/40",
              over && game.status === Status.DECLASSIFIED && "bg-foreground text-background ring-foreground",
              !over && (index === typed.length ? "bg-background ring-2 ring-primary" : "bg-background ring-foreground/20")
            ),
            "lg"
          )}
        {/each}
      </div>

      <p class="min-h-5 shrink-0 truncate text-center text-ui" aria-live="polite">{status}</p>

      <div class="relative shrink-0">
        <div class="grid grid-cols-5 gap-1.5 select-none" role="group" aria-label="Digits">
          {#each PAD as digit (digit)}
            <Button
              variant="secondary"
              class="h-11 px-0 font-mono text-lg tabular-nums pointer-coarse:h-13"
              tabindex={-1}
              disabled={over}
              onpointerdown={keep_focus}
              onclick={() => press(digit)}>{digit}</Button
            >
          {/each}
          <Button variant="quiet" class="col-span-2 h-11 pointer-coarse:h-13" tabindex={-1} disabled={over || typed.length === 0} onpointerdown={keep_focus} onclick={erase}>
            <BackspaceIcon weight="bold" />Erase
          </Button>
          <Button variant="primary" class="col-span-3 h-11 pointer-coarse:h-13" tabindex={-1} disabled={over} onpointerdown={keep_focus} onclick={transmit}>
            <PaperPlaneTiltIcon weight="bold" />Transmit
          </Button>
        </div>
        {#if overlay}
          <BoardOverlay class="-m-1 rounded-lg" title={overlay.title} detail={overlay.detail}>
            <Button size="sm" variant="primary" onclick={() => start_over()}>{daily ? "Open a new case" : "New case"}</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @3xl:static @3xl:block @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-foreground/8 @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @3xl:hidden" />
      <Section title="Statistics" description="Cases cracked per code length. Declassified cases don't count.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each LENGTHS as each (each)}
          {@const row = stats.value[each]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === game.length ? "font-medium" : "text-foreground/80")}>{each} digits</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Cracked {row.solved} · Fewest {row.best ?? "–"} · Best {row.best_ms === null ? "–" : format_time(row.best_ms)}
            </span>
          </div>
        {/each}
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span class="shrink-0 font-mono tabular-nums">{guesses(used)}</span>
    {#if daily}<span class="shrink-0">Daily · {daily}</span>{/if}
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">Fewest {entry.best ?? "–"}</span>
    <span class="hidden @2xl:inline pointer-coarse:hidden">Digits type · Enter transmits · Backspace erases</span>
  </StatusBar>
</div>

<style>
  .entry {
    --slot: clamp(2.5rem, (100cqw - (var(--len) - 1) * 0.375rem) / var(--len), 3.5rem);
  }

  .entry :global(.slot) {
    width: var(--slot);
    height: calc(var(--slot) * 1.1);
  }

  .shake {
    animation: shake 400ms var(--ease-out);
  }

  @keyframes shake {
    20%,
    60% {
      translate: -4px 0;
    }
    40%,
    80% {
      translate: 4px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shake {
      animation: none;
    }
  }
</style>
