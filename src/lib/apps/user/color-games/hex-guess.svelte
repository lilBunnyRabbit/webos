<script lang="ts">
  import kernel, { Platform } from "$lib/core/api";
  import { Stopwatch } from "$kit/games";
  import { Button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { ArrowDown as ArrowDownIcon, ArrowUp as ArrowUpIcon, Backspace as BackspaceIcon, Check as CheckIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { HEX_DIGITS, HEX_GUESSES, HEX_LENGTH, hex_hints, hex_status, hex_target, HexStatus, Hint, is_hex_digit, type HexState } from "./hex";
  import type { RunProps } from "./run";
  import ShareCard from "./share-card.svelte";
  import { hex_share } from "./share";
  import { Flash } from "$kit/utils/flash.svelte";

  let { seed, daily, head, link, saved, onsave, onfinish, next }: RunProps<HexState> = $props();

  const { window: win } = get_app_context();
  const initial = untrack(() => ({ seed, saved }));
  const target = hex_target(initial.seed);
  const clock = new Stopwatch(() => win.is_visible, initial.saved?.ms ?? 0);
  const keypad_always = kernel.platform === Platform.MOBILE;

  const initial_guesses = initial.saved?.guesses.slice(0, HEX_GUESSES) ?? [];
  let guesses = $state<string[]>(initial_guesses);
  let typed = $state("");
  const flash = new Flash(1800);
  let root = $state<HTMLDivElement>();

  const status = $derived(hex_status(guesses, target));
  const over = $derived(status !== HexStatus.PLAYING);
  const rows = $derived(guesses.map((guess) => ({ guess, hints: hex_hints(guess, target) })));
  const last = $derived(guesses.at(-1) ?? null);

  if (initial_guesses.length && hex_status(initial_guesses, target) === HexStatus.PLAYING) clock.start();

  function press(digit: string) {
    if (over || typed.length >= HEX_LENGTH) return;
    if (!clock.running) clock.start();
    typed += digit.toUpperCase();
    flash.clear();
  }

  function erase() {
    if (!over) typed = typed.slice(0, -1);
  }

  function submit() {
    if (over) return;
    if (typed.length < HEX_LENGTH) {
      flash.show(`Type all ${HEX_LENGTH} digits`);
      return;
    }
    guesses = [...guesses, typed];
    typed = "";
    const result = hex_status(guesses, target);
    if (result !== HexStatus.PLAYING) {
      const ms = clock.pause();
      if (result === HexStatus.WON) onfinish(ms, guesses.length);
    }
    onsave({ guesses: [...guesses], ms: clock.read() });
  }

  $effect(() => {
    if (win.is_focused && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  });

  function on_keydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const target_element = event.target as HTMLElement;
    if (target_element.closest("input, select, textarea")) return;
    if (is_hex_digit(event.key)) {
      event.preventDefault();
      press(event.key);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      erase();
    } else if (event.key === "Enter" && !target_element.closest("button")) {
      event.preventDefault();
      submit();
    }
  }

  // Keypad keys never take focus, so Enter typed after a tap still submits instead of pressing the key again.
  function keep_focus(event: PointerEvent) {
    event.preventDefault();
  }

  const HINT_ICON = { [Hint.UP]: ArrowUpIcon, [Hint.DOWN]: ArrowDownIcon, [Hint.EXACT]: CheckIcon };
  const HINT_LABEL = { [Hint.UP]: "higher", [Hint.DOWN]: "lower", [Hint.EXACT]: "right" };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  class="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col gap-3 overflow-auto p-3 outline-none"
  tabindex="0"
  role="application"
  aria-label="Hex guess: type six hex digits, Enter to guess, Backspace to delete"
  onkeydown={on_keydown}
>
  <div class="grid shrink-0 grid-cols-2 gap-2">
    <figure class="flex flex-col gap-1">
      <div class="h-20 rounded-xl ring-1 ring-foreground/10 @sm:h-24" style:background-color="#{target}" role="img" aria-label="The colour to name"></div>
      <figcaption class="text-2xs text-foreground/65">Target <span class="font-mono">{over ? `#${target}` : "#??????"}</span></figcaption>
    </figure>
    <figure class="flex flex-col gap-1">
      {#if last}
        <div class="h-20 rounded-xl ring-1 ring-foreground/10 @sm:h-24" style:background-color="#{last}" role="img" aria-label="Your last guess, #{last}"></div>
      {:else}
        <div class="grid h-20 place-items-center rounded-xl border border-dashed border-foreground/20 text-ui text-foreground/50 @sm:h-24">Your guess</div>
      {/if}
      <figcaption class="text-2xs text-foreground/65">Last guess <span class="font-mono">{last ? `#${last}` : ""}</span></figcaption>
    </figure>
  </div>

  <ol class="flex shrink-0 flex-col gap-1.5" aria-label="Guesses">
    {#each { length: HEX_GUESSES }, row (row)}
      {@const entry = rows[row]}
      {@const active = !over && row === guesses.length}
      <li class="flex items-center gap-2">
        <span class="w-5 shrink-0 font-mono text-2xs text-foreground/50 tabular-nums">{row + 1}</span>
        <span class="text-foreground/40 font-mono">#</span>
        <div class="grid flex-1 grid-cols-6 gap-1" aria-label={entry ? `#${entry.guess}: ${entry.hints.map((hint) => HINT_LABEL[hint]).join(", ")}` : undefined}>
          {#each { length: HEX_LENGTH }, column (column)}
            {@const hint = entry?.hints[column]}
            {@const Icon = hint ? HINT_ICON[hint] : null}
            <span
              class={cn(
                "flex h-10 flex-col items-center justify-center rounded-md font-mono text-base font-semibold ring-1 ring-inset @sm:h-11",
                hint === Hint.EXACT && "bg-success/15 text-success ring-success/40",
                hint && hint !== Hint.EXACT && "bg-background-light ring-foreground/15",
                !hint && active && column === typed.length && "ring-2 ring-primary",
                !hint && !(active && column === typed.length) && "ring-foreground/10",
                !hint && !active && "opacity-60"
              )}
              aria-hidden={entry ? "true" : undefined}
            >
              <span class="leading-none">{entry ? entry.guess[column] : active ? (typed[column] ?? "") : ""}</span>
              {#if Icon}<Icon class="size-3" weight="bold" />{/if}
            </span>
          {/each}
        </div>
      </li>
    {/each}
  </ol>

  <p class="min-h-5 shrink-0 text-center text-ui" aria-live="polite">
    {#if flash.text}
      {flash.text}
    {:else if status === HexStatus.WON}
      Got it in {guesses.length} of {HEX_GUESSES}.
    {:else if status === HexStatus.LOST}
      Out of guesses. It was <span class="font-mono">#{target}</span>.
    {:else}
      ↑ the digit is higher, ↓ lower, ✓ right.
    {/if}
  </p>

  {#if over}
    <div class="flex justify-center">
      <ShareCard text={hex_share(head, rows.map((entry) => entry.hints), status === HexStatus.WON, link)} {next} />
    </div>
    {#if daily && status === HexStatus.LOST}<p class="text-center text-2xs text-foreground/65">A missed daily doesn't count in Game Hub.</p>{/if}
  {:else}
    <div class={cn("keypad shrink-0 grid-cols-8 gap-1 select-none", keypad_always ? "grid" : "hidden pointer-coarse:grid")} role="group" aria-label="Hex digits">
      {#each HEX_DIGITS as digit (digit)}
        <Button variant="secondary" class="h-11 px-0 font-mono text-base" tabindex={-1} onpointerdown={keep_focus} onclick={() => press(digit)}>{digit}</Button>
      {/each}
      <Button variant="quiet" class="col-span-3 h-11" tabindex={-1} disabled={typed.length === 0} onpointerdown={keep_focus} onclick={erase}>
        <BackspaceIcon weight="bold" />Erase
      </Button>
      <Button variant="primary" class="col-span-5 h-11" tabindex={-1} onpointerdown={keep_focus} onclick={submit}>Guess</Button>
    </div>
    <div class={cn("justify-end", keypad_always ? "hidden" : "flex pointer-coarse:hidden")}>
      <Button variant="primary" disabled={typed.length < HEX_LENGTH} onclick={submit}>Guess</Button>
    </div>
  {/if}
</div>
