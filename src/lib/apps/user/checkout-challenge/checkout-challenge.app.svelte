<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$kit/games";
  import { Badge, BoardOverlay, Button, IconButton, StatusBar, Toolbar, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Backspace as BackspaceIcon,
    Check as CheckIcon,
    Coins as CoinsIcon,
    HandHeart as HandHeartIcon,
    Heart as HeartIcon,
    KeyReturn as KeyReturnIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Star as StarIcon,
    Storefront as StorefrontIcon,
    Timer as TimerIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import CustomerFace from "./customer.svelte";
  import {
    accuracy,
    all_scanned,
    best_run_schema,
    better_run,
    DAY_MS,
    difficulty,
    DISPUTE_MS,
    flashing,
    format_amount,
    Lamp,
    MAX_CLOSURES,
    MAX_HEALTH,
    MAX_SORRY,
    Mood,
    NO_BEST,
    Phase,
    run_summary,
    sales,
    scanned_total,
    spotless_day,
    Stage,
    stars,
    type BestRun,
    type Run,
  } from "./game";
  import { PRODUCT_INFO } from "./products";
  import { KeypadKey, Shop } from "./shop.svelte";

  const KEYPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", KeypadKey.BACK];
  const GREETINGS = ["Hi there!", "Just these, please.", "Hello!", "Lovely day!", "Ready when you are.", "Morning!"];

  const { app_id, window: win, storage, achievements } = get_app_context();
  track_play(app_id, () => win.is_visible);
  const best = storage.persisted<BestRun>("best", NO_BEST, best_run_schema);
  const sales_total = storage.persisted("sales", 0, z.number().int().nonnegative());

  let new_best = $state(false);
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  const shop = new Shop(Math.random, on_end);
  $effect(() => () => shop.destroy());

  const run = $derived(shop.run);
  const customer = $derived(run.customer);
  const with_cents = $derived(difficulty(run.day).cents);
  const amount = (cents: number) => format_amount(cents, with_cents);
  const money = (cents: number) => format_amount(cents, true);
  const total = $derived(customer ? scanned_total(customer) : 0);
  const ready_to_ring = $derived(!!customer && all_scanned(customer));
  const receipt = $derived(customer ? customer.receipt.map((index) => ({ index, item: customer.items[index] })).reverse() : []);
  const remaining = $derived(Math.max(0, Math.ceil((DAY_MS - run.clock) / 1000)));
  const clock_text = $derived(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`);
  const disputed = $derived(customer?.stage === Stage.DISPUTED);
  const dispute_left = $derived(
    disputed && customer?.dispute_until != null ? Math.max(0, (customer.dispute_until - run.clock) / DISPUTE_MS) : 0
  );
  const bad_lit = $derived(disputed || (run.lamp?.kind === Lamp.BAD && flashing(run.lamp, run.clock)));
  const ok_lit = $derived(run.lamp?.kind === Lamp.OK && flashing(run.lamp, run.clock));
  const health_tone = $derived(run.health > 50 ? "bg-success" : run.health > 25 ? "bg-warning" : "bg-error");
  const today_stars = $derived(stars(run.today, run.closed_early));
  const today_accuracy = $derived(Math.round(accuracy(run.today) * 100));
  const run_accuracy = $derived(Math.round(accuracy(run.totals) * 100));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const running = $derived(shop.open && !shop.paused && !blocked);
  const can_type = $derived(shop.open && !shop.paused && !!customer && customer.leave_at === null);

  const speech = $derived.by(() => {
    if (!customer) return run.clock >= DAY_MS ? "Closing time!" : "Waiting for the next customer…";
    if (customer.stage === Stage.DONE) {
      if (customer.mood === Mood.HAPPY) return "Thank you!";
      if (customer.mood === Mood.MEH) return "Thanks, I guess.";
      return "That's not what it costs!";
    }
    if (customer.stage === Stage.DISPUTED) return run.sorry_tokens > 0 ? "Hmm, that's not right…" : "That's not right!";
    if (customer.stage === Stage.RETYPING) return "Okay, try again.";
    if (flashing(run.unscanned, run.clock, 1500)) return "You missed something!";
    return GREETINGS[customer.id % GREETINGS.length];
  });

  $effect(() => {
    if (blocked && shop.open && !shop.paused) shop.paused = true;
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!running) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      shop.advance(Math.min(now - last, 100));
      last = now;
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });

  function on_end(ended: Run) {
    record_day(ended);
    const summary = run_summary(ended);
    if (!better_run(summary, best.value)) return;
    best.value = summary;
    new_best = true;
  }

  function record_day(ended: Run) {
    sales_total.value += sales(ended.today);
    if (!ended.closed_early) achievements.achieve("first-day");
    if (stars(ended.today, ended.closed_early) === 3) achievements.achieve("three-stars");
    if (spotless_day(ended)) achievements.achieve("spotless");
    achievements.progress("days-7", ended.days_survived);
    achievements.progress("money-1000", Math.floor(ended.money / 100));
    achievements.progress("sales-500", sales_total.value);
  }

  function start() {
    if (run.phase === Phase.GAME_OVER) {
      new_best = false;
      shop.new_run();
    } else shop.open_shop();
    board?.focus({ preventScroll: true });
  }

  function restart() {
    new_best = false;
    shop.new_run();
    board?.focus({ preventScroll: true });
  }

  // Scanned items and the keypad turn disabled mid-sale, and a disabled button drops focus to the page, taking the keys
  // with it; the board keeps focus instead.
  function keep_focus(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
  }

  function typed_key(event: KeyboardEvent): string | null {
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    if (digit) return digit[1];
    if (/^\d$/.test(event.key)) return event.key;
    if (event.code === "NumpadDecimal" || event.key === "." || event.key === ",") return ".";
    if (event.key === "Backspace") return KeypadKey.BACK;
    if (event.key === "Enter") return KeypadKey.ENTER;
    return null;
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.target instanceof Node) || !board?.contains(event.target)) return;
    const key = typed_key(event);
    if (key === KeypadKey.ENTER && !shop.open) {
      event.preventDefault();
      start();
    } else if (key) {
      event.preventDefault();
      if (!event.repeat || key === KeypadKey.BACK) shop.press(key);
    } else if (event.code === "Space") {
      event.preventDefault();
      shop.scan_next();
    } else if (event.code === "KeyS") {
      event.preventDefault();
      shop.sorry();
    } else if (event.code === "KeyP" || event.code === "Escape") {
      if (!shop.open) return;
      event.preventDefault();
      shop.toggle_pause();
    }
  }
</script>

{#snippet star_row(count: number)}
  <span class="flex basis-full justify-center gap-1" aria-label="{count} of 3 stars">
    {#each [0, 1, 2] as index (index)}
      <StarIcon class="size-7 {index < count ? 'text-primary' : 'text-foreground/20'}" weight={index < count ? "fill" : "regular"} />
    {/each}
  </span>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown} onmousedown={keep_focus}>
  <Toolbar>
    <Badge>Day {run.day}</Badge>
    <span class="flex items-center gap-1 font-mono text-ui tabular-nums {remaining <= 10 && shop.open ? 'text-warning' : ''}">
      <TimerIcon class="size-4" weight="bold" />{clock_text}
    </span>
    <span class="flex items-center gap-1 font-mono text-ui tabular-nums">
      <CoinsIcon class="size-4" weight="bold" />{money(run.money)}
    </span>
    <div class="flex-1"></div>
    <IconButton size="sm" label={shop.paused ? "Resume (P)" : "Pause (P)"} disabled={!shop.open} onclick={() => shop.toggle_pause()}>
      {#if shop.paused}<PlayIcon weight="bold" />{:else}<PauseIcon weight="bold" />{/if}
    </IconButton>
    <Button size="sm" variant="primary" onclick={restart}>New run</Button>
  </Toolbar>

  <div class="relative min-h-0">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={board}
      role="application"
      aria-label="Checkout Challenge. Click each item to scan it, or press Space. Type the total and press Enter. S says sorry, P pauses."
      tabindex="0"
      class="mx-auto grid h-full max-w-4xl content-between gap-2 overflow-auto p-3 outline-none @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:content-center @2xl:gap-6 @2xl:p-6"
    >
      <section class="flex min-w-0 flex-col gap-2 @2xl:justify-end @2xl:gap-3" aria-label="Counter">
        <div class="flex min-h-16 items-end gap-3 @2xl:flex-1 @2xl:flex-col @2xl:items-center @2xl:justify-end">
          {#if customer}
            {#key customer.id}
              <div class="cc-enter relative shrink-0 {customer.leave_at !== null ? 'cc-leave' : ''}">
                <CustomerFace mood={customer.mood} look={customer.look} ears={customer.ears} class="size-16 @2xl:size-40" />
                {#if customer.stage === Stage.DONE && customer.paid > 0}
                  <span class="cc-float absolute top-1/3 left-[80%] font-mono text-sm font-semibold text-success tabular-nums">
                    +{amount(customer.paid)}
                  </span>
                {/if}
              </div>
            {/key}
          {:else}
            <div class="grid size-16 shrink-0 place-items-center text-foreground/20 @2xl:size-40">
              <StorefrontIcon class="size-12 @2xl:size-16" weight="duotone" />
            </div>
          {/if}
          <p class="mb-2 max-w-56 rounded-xl bg-background-light px-3 py-2 text-ui @2xl:order-first @2xl:mb-0" aria-live="polite">
            {speech}
          </p>
        </div>

        <div class="rounded-xl bg-background-light p-1.5 @2xl:p-2" aria-label="Items on the counter">
          <div class="flex min-h-12 flex-wrap gap-1.5 @2xl:min-h-16 @2xl:gap-2">
            {#each customer?.items ?? [] as item, index (index)}
              {@const info = PRODUCT_INFO[item.product]}
              <button
                type="button"
                class={cn(
                  "relative flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-lg @2xl:h-16 transition-[background-color,opacity] duration-150",
                  item.scanned ? "bg-foreground/4 opacity-50" : "bg-foreground/8 hover:bg-foreground/12 active:bg-foreground/16",
                  !item.scanned && flashing(run.unscanned, run.clock) && "animate-wiggle"
                )}
                aria-label={item.scanned ? `${info.name}, scanned, ${amount(item.cents)}` : `Scan ${info.name}`}
                disabled={item.scanned || !can_type || disputed}
                onclick={() => shop.scan(index)}
              >
                <info.icon class="size-5 @2xl:size-7" weight="duotone" />
                <span class="max-w-full truncate px-1 text-2xs">{info.name}</span>
                {#if item.scanned}
                  <CheckIcon class="absolute top-1 right-1 size-3 text-success" weight="bold" />
                {/if}
              </button>
            {:else}
              <p class="self-center px-2 text-ui text-foreground/65">The counter is empty.</p>
            {/each}
          </div>
        </div>
      </section>

      <section class="flex min-w-0 gap-2 @2xl:w-72 @2xl:gap-3" aria-label="Register">
        <div class="flex w-5 shrink-0 flex-col items-center gap-1.5">
          <HeartIcon class="size-4 {run.health > 25 ? 'text-foreground/65' : 'text-error'}" weight="fill" />
          <div
            class="relative w-2.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
            role="meter"
            aria-label="Shop health"
            aria-valuemin={0}
            aria-valuemax={MAX_HEALTH}
            aria-valuenow={run.health}
          >
            <span
              class="absolute inset-0 origin-bottom rounded-full transition-transform duration-300 {health_tone}"
              style:transform="scaleY({run.health / MAX_HEALTH})"
            ></span>
          </div>
          <span class="font-mono text-2xs text-foreground/80 tabular-nums">{run.health}</span>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-col rounded-xl bg-background-light p-2 font-mono text-2xs" aria-label="Receipt">
            <ol class="flex max-h-12 flex-col-reverse overflow-y-auto @2xl:max-h-40">
              {#each receipt as { index, item } (index)}
                <li class="flex justify-between gap-2 text-foreground/80">
                  <span class="truncate">{PRODUCT_INFO[item.product].name}</span>
                  <span class="tabular-nums">{amount(item.cents)}</span>
                </li>
              {/each}
            </ol>
            <div class="mt-1 flex items-baseline justify-between gap-2 border-t border-dashed border-foreground/20 pt-1">
              <span class="text-foreground/65 uppercase">{ready_to_ring ? "Total" : "Running total"}</span>
              <span class="text-xl font-semibold tabular-nums {ready_to_ring ? 'text-primary' : ''}">{amount(total)}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span
              class={cn(
                "grid size-8 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150",
                bad_lit ? "bg-error text-background shadow-[0_0_14px_var(--color-error)]" : "bg-foreground/8 text-foreground/38"
              )}
              aria-label={bad_lit ? "Wrong" : undefined}
            >
              <XIcon class="size-4" weight="bold" />
            </span>
            <output
              class="flex h-12 min-w-0 flex-1 items-center justify-end overflow-hidden rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 font-mono text-2xl tabular-nums ring-1 ring-foreground/10 ring-inset"
              aria-label="Typed amount"
            >
              {#if run.typed}{run.typed}{:else}<span class="text-foreground/30">0</span>{/if}
              {#if can_type && !disputed}<span class="cc-caret ml-0.5 h-6 w-0.5 bg-primary"></span>{/if}
            </output>
            <span
              class={cn(
                "grid size-8 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150",
                ok_lit ? "bg-success text-background shadow-[0_0_14px_var(--color-success)]" : "bg-foreground/8 text-foreground/38"
              )}
              aria-label={ok_lit ? "Right" : undefined}
            >
              <CheckIcon class="size-4" weight="bold" />
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Keypad">
            {#each KEYPAD as key (key)}
              <button
                type="button"
                class={button({
                  variant: "secondary",
                  class: cn("h-10 rounded-lg font-mono text-lg pointer-coarse:h-12 @2xl:h-11", shop.lit === key && "bg-primary/20 text-primary"),
                })}
                aria-label={key === KeypadKey.BACK ? "Backspace" : key === "." ? "Decimal point" : key}
                disabled={!can_type || disputed}
                onclick={() => shop.press(key)}
              >
                {#if key === KeypadKey.BACK}<BackspaceIcon class="size-5" weight="bold" />{:else}{key}{/if}
              </button>
            {/each}
          </div>

          <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-1.5">
            <div class="relative">
              <Button
                variant={disputed && run.sorry_tokens > 0 ? "primary" : "secondary"}
                class="h-10 w-full rounded-lg pointer-coarse:h-12 @2xl:h-11 {disputed && run.sorry_tokens > 0 ? 'animate-wiggle' : ''}"
                disabled={!disputed || run.sorry_tokens === 0 || shop.paused}
                onclick={() => shop.sorry()}
              >
                <HandHeartIcon class="size-5" weight="bold" />
                Sorry
                <span class="font-mono text-2xs tabular-nums opacity-80">×{run.sorry_tokens}</span>
              </Button>
              {#if disputed}
                <span class="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-background/30">
                  <span class="block h-full origin-left bg-background" style:transform="scaleX({dispute_left})"></span>
                </span>
              {/if}
              {#if flashing(run.earned, run.clock, 1600)}
                <span class="absolute -top-2 right-1 animate-pop-in rounded-full bg-success px-1.5 font-mono text-2xs text-background">+1</span>
              {/if}
            </div>
            <button
              type="button"
              class={button({
                variant: "primary",
                class: cn("h-10 rounded-lg text-sm pointer-coarse:h-12 @2xl:h-11", shop.lit === KeypadKey.ENTER && "opacity-70"),
              })}
              disabled={!can_type || (!disputed && !run.typed)}
              onclick={() => shop.press(KeypadKey.ENTER)}
            >
              <KeyReturnIcon class="size-5" weight="bold" />
              {disputed ? "Let it go" : "Enter"}
            </button>
          </div>
        </div>
      </section>
    </div>

    {#if run.phase === Phase.READY}
      <BoardOverlay title="Checkout Challenge" class="rounded-none">
        <p class="basis-full text-ui text-foreground/80"><span class="inline-block max-w-72">
          Tap each item to scan it, then type the total exactly and press Enter. Mistakes hurt the shop; a Sorry lets you
          retype for half the damage.
        </span></p>
        <Button variant="primary" onclick={start}>Open the shop</Button>
      </BoardOverlay>
    {:else if shop.open && shop.paused}
      <BoardOverlay title="Paused" class="rounded-none">
        <Button variant="primary" onclick={() => shop.toggle_pause()}>Resume</Button>
      </BoardOverlay>
    {:else if run.phase === Phase.DAY_OVER}
      <BoardOverlay
        title={run.closed_early ? `Closed early on day ${run.day}` : `Day ${run.day} done`}
        detail="Money {money(run.today.money)} · Sales {sales(run.today)} · Accuracy {today_accuracy}%"
        class="rounded-none"
      >
        {@render star_row(today_stars)}
        <p class="basis-full font-mono text-2xs text-foreground/65 tabular-nums">
          {run.closed_early ? `Closures ${run.closures} of ${MAX_CLOSURES} · ` : ""}Sorry ×{run.sorry_tokens} of {MAX_SORRY}
        </p>
        <Button variant="primary" onclick={start}>Open day {run.day + 1}</Button>
      </BoardOverlay>
    {:else if run.phase === Phase.GAME_OVER}
      <BoardOverlay
        title="The shop is lost"
        detail="Money {money(run.money)} · Days {run.days_survived} · Accuracy {run_accuracy}%"
        class="rounded-none"
      >
        <p class="basis-full font-mono text-2xs text-foreground/65 tabular-nums">
          {new_best ? "New best run!" : `Best ${money(best.value.money)} · ${best.value.days} days`}
        </p>
        <Button variant="primary" onclick={start}>New run</Button>
      </BoardOverlay>
    {/if}
  </div>

  <StatusBar>
    <span class="tabular-nums">Today {money(run.today.money)}</span>
    <span class="tabular-nums">Accuracy {sales(run.today) ? `${today_accuracy}%` : "–"}</span>
    <span class="tabular-nums">Streak {run.streak}</span>
    <span class="hidden tabular-nums @md:inline">Closures {run.closures}/{MAX_CLOSURES}</span>
    <span class="hidden tabular-nums @lg:inline">Best {money(best.value.money)}</span>
    <span class="hidden @3xl:inline">Space scans · Enter rings up · S sorry</span>
  </StatusBar>
</div>

<style>
  .cc-enter {
    animation: cc-enter 360ms var(--ease-out);
  }

  .cc-leave {
    animation: cc-leave 1000ms var(--ease-in-out) forwards;
  }

  .cc-float {
    animation: cc-float 1000ms var(--ease-out) forwards;
  }

  .cc-caret {
    animation: cc-blink 1s steps(1) infinite;
  }

  @keyframes cc-enter {
    from {
      opacity: 0;
      translate: -2rem 0;
    }
  }

  @keyframes cc-leave {
    0%,
    50% {
      opacity: 1;
      translate: 0 0;
    }
    100% {
      opacity: 0;
      translate: 2rem 0;
    }
  }

  @keyframes cc-float {
    to {
      opacity: 0;
      translate: 0 -2rem;
    }
  }

  @keyframes cc-blink {
    50% {
      opacity: 0;
    }
  }
</style>
