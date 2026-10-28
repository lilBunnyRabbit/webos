<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$kit/games";
  import { Badge, BoardOverlay, Button, StatusBar, Switch, Toolbar, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Backspace as BackspaceIcon,
    Check as CheckIcon,
    Coins as CoinsIcon,
    Confetti as ConfettiIcon,
    KeyReturn as KeyReturnIcon,
    LockKey as LockKeyIcon,
    SealPercent as SealPercentIcon,
    Siren as SirenIcon,
    Star as StarIcon,
    Storefront as StorefrontIcon,
    UserPlus as UserPlusIcon,
    UsersThree as UsersThreeIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import BooksView from "./books.svelte";
  import CustomerFace from "./customer.svelte";
  import {
    accuracy,
    best_run_schema,
    better_run,
    can_hire,
    current_item,
    day_customers,
    difficulty,
    entered_total,
    flashing,
    format_amount,
    Lamp,
    list_total,
    mask,
    MAX_JAIL_DAYS,
    MAX_TRUST,
    Mood,
    NO_BEST,
    patron_label,
    Phase,
    run_summary,
    SALE_DISCOUNT,
    save_run,
    saved_run_schema,
    spotless_day,
    Stage,
    staff_price,
    stars,
    type BestRun,
    type Run,
    type SavedRun,
  } from "./game";
  import Police from "./police.svelte";
  import { PRODUCT_INFO } from "./products";
  import Restock from "./restock.svelte";
  import { KeypadKey, Shop } from "./shop.svelte";

  const KEYPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", KeypadKey.BACK];

  const { app_id, window: win, storage, achievements } = get_app_context();
  track_play(app_id, () => win.is_visible);
  const best = storage.persisted<BestRun>("best", NO_BEST, best_run_schema);
  const sales_total = storage.persisted("sales", 0, z.number().int().nonnegative());
  const saved = storage.persisted<SavedRun | null>("run", null, saved_run_schema.nullable());

  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  const shop = new Shop(Math.random, {
    on_end: record_day,
    on_close: (closed) => {
      saved.value = save_run(closed);
    },
    on_lost: () => storage.remove("run"),
  });
  $effect(() => () => shop.destroy());

  const run = $derived(shop.run);
  const customer = $derived(run.customer);
  const patron = $derived(customer ? run.roster.find((entry) => entry.id === customer.patron) : undefined);
  const with_cents = $derived(difficulty(run.day).cents);
  const amount = (cents: number) => format_amount(cents, with_cents);
  const money = (cents: number) => format_amount(cents, true);
  const watched = $derived(run.phase === Phase.OPEN && run.police_left > 0);
  const serving = $derived(run.phase === Phase.OPEN && !!customer && customer.stage !== Stage.DONE);
  const keypad_on = $derived(serving || run.phase === Phase.WARMUP || run.phase === Phase.RESTOCK);
  const digits_only = $derived(run.phase === Phase.WARMUP || run.phase === Phase.RESTOCK);
  const warm_target = $derived(run.phase === Phase.WARMUP ? run.warmup[0] : null);
  const current = $derived(customer?.stage === Stage.ITEMS ? current_item(customer) : -1);
  const left_today = $derived(run.jailed ? 0 : Math.max(0, day_customers(run.day) - run.arrived));
  const result = $derived(customer?.result ?? null);
  const off_by = $derived(result ? result.given - result.total : 0);
  const bad_lit = $derived(run.lamp?.kind === Lamp.BAD && flashing(run.lamp, run.clock, 1_500));
  const ok_lit = $derived(run.lamp?.kind === Lamp.OK && flashing(run.lamp, run.clock, 1_500));
  const miss = $derived(
    (run.phase === Phase.WARMUP && flashing(run.warm_miss, run.clock, 400)) ||
      (run.phase === Phase.RESTOCK && flashing(run.code_miss, run.clock, 400))
  );
  const hire_ok = $derived(can_hire(run));
  const today_accuracy = $derived(Math.round(accuracy(run.today) * 100));
  const run_accuracy = $derived(Math.round(accuracy(run.totals) * 100));
  const running = $derived(shop.animating && win.is_focused && win.is_visible);
  const display = $derived.by(() => {
    if (run.phase === Phase.RESTOCK) return run.code;
    return watched ? mask(run.typed) : run.typed;
  });

  const register_label = $derived.by(() => {
    if (run.phase === Phase.WARMUP) return `Warm-up ${10 - run.warmup.length} of 10`;
    if (run.phase === Phase.RESTOCK) return "Restock code";
    if (!customer) return "Total";
    if (customer.stage === Stage.ITEMS) return `Item ${current + 1} of ${customer.items.length}`;
    if (customer.stage === Stage.TOTAL) return customer.staffed ? "Staff rang up" : "Give the total";
    if (customer.stage === Stage.CONFIRM) return "Once more";
    if (off_by === 0) return "Right";
    return off_by < 0 ? `${amount(-off_by)} short` : `${amount(off_by)} over`;
  });

  const speech = $derived.by(() => {
    if (run.phase === Phase.WARMUP) return "Company policy: warm up first. Press the green key.";
    if (run.phase === Phase.RESTOCK) return "Type the codes to restock the shelves.";
    if (!customer || !patron) return left_today > 0 ? "Next, please…" : "That was the last one.";
    if (customer.stage === Stage.DONE) {
      if (run.jailed) return "Officer, take them away!";
      if (off_by === 0) return customer.party ? "The party is saved, thanks!" : "Thank you!";
      if (flashing(run.reported, run.clock, 3_000)) return "That's it, I'm calling the police!";
      return off_by > 0 ? "That's too much!" : "That's not right…";
    }
    if (customer.stage === Stage.CONFIRM) return "Say that again?";
    if (watched) return "The officer is watching you.";
    if (customer.doubting) return "Type it twice. I don't trust you.";
    if (customer.stage === Stage.TOTAL) return "What do I owe you?";
    if (customer.party) return "It's for a party!";
    return patron.visits > 1 ? "Hello again!" : `Hi, I'm ${patron.name}!`;
  });

  const trust_tone = $derived(
    !patron ? "" : patron.trust >= 70 ? "bg-success" : patron.trust >= 35 ? "bg-warning" : "bg-error"
  );

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

  function record_day(ended: Run) {
    sales_total.value += ended.today.served;
    if (!ended.jailed) achievements.achieve("first-day");
    if (stars(ended.today, ended.jailed) === 3) achievements.achieve("three-stars");
    if (spotless_day(ended)) achievements.achieve("spotless");
    if (ended.today.parties > 0) achievements.achieve("party");
    if (ended.today.cleared > 0) achievements.achieve("clean-record");
    if (ended.roster.some((entry) => entry.trust >= MAX_TRUST)) achievements.achieve("best-friend");
    achievements.progress("days-7", ended.days_survived);
    achievements.progress("money-1000", Math.floor(ended.totals.money / 100));
    achievements.progress("sales-500", sales_total.value);
    const summary = run_summary(ended);
    if (better_run(summary, best.value)) best.value = summary;
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function start() {
    if (run.phase === Phase.GAME_OVER) shop.new_run();
    else if (run.phase === Phase.READY && saved.value) shop.continue_run(saved.value);
    else shop.start();
    focus_board();
  }

  async function new_shop() {
    const playing = run.phase !== Phase.READY && run.phase !== Phase.GAME_OVER;
    if (playing || saved.value) {
      const go = await win.confirm("Start a new shop?", {
        detail: "Your shop, its regulars and its cash are gone for good.",
        confirm_label: "New shop",
        danger: true,
      });
      if (!go) return;
    }
    storage.remove("run");
    shop.new_run();
    focus_board();
  }

  // The keypad turns disabled mid-sale, and a disabled button drops focus to the page, taking the keys with it; the
  // board keeps focus instead.
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
    const waiting = run.phase === Phase.READY || run.phase === Phase.DAY_OVER || run.phase === Phase.GAME_OVER;
    if (key === KeypadKey.ENTER && waiting) {
      event.preventDefault();
      start();
    } else if (key) {
      event.preventDefault();
      if (!event.repeat || key === KeypadKey.BACK) shop.press(key);
    } else if (event.code === "KeyH") {
      event.preventDefault();
      shop.hire();
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
    <span class="flex items-center gap-1 font-mono text-ui tabular-nums" title="Customers still to come today">
      <UsersThreeIcon class="size-4" weight="bold" />{left_today}
    </span>
    <span class="flex items-center gap-1 font-mono text-ui tabular-nums {run.money < 0 ? 'text-error' : ''}">
      <CoinsIcon class="size-4" weight="bold" />{money(run.money)}
    </span>
    {#if run.jail_days > 0}
      <span class="flex items-center gap-1 font-mono text-ui text-error tabular-nums" title="Days in jail">
        <LockKeyIcon class="size-4" weight="bold" />{run.jail_days}/{MAX_JAIL_DAYS}
      </span>
    {/if}
    {#if run.sale && run.phase !== Phase.READY}
      <span class="hidden items-center gap-1 text-ui text-primary @sm:flex"><SealPercentIcon class="size-4" weight="bold" />Sale</span>
    {/if}
    <div class="flex-1"></div>
    <Button size="sm" variant="primary" onclick={new_shop}>New shop</Button>
  </Toolbar>

  <div class="relative min-h-0">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={board}
      role="application"
      aria-label="Checkout Challenge. Type each price and press Enter, then type the total and press Enter. H hires staff."
      tabindex="0"
      class={cn(
        "mx-auto grid h-full max-w-4xl content-between gap-2 overflow-auto p-3 outline-none transition-colors duration-300 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:content-center @2xl:gap-6 @2xl:p-6",
        watched && "bg-error/10 ring-2 ring-error/50 ring-inset"
      )}
    >
      <section class="flex min-w-0 flex-col gap-2 @2xl:justify-end @2xl:gap-3" aria-label="Counter">
        {#if run.phase === Phase.RESTOCK && run.books}
          <div class="flex flex-col gap-2 rounded-xl bg-background-light p-2.5">
            <p class="text-ui font-semibold">Day {run.day} books</p>
            <BooksView books={run.books} />
          </div>
          <p class="text-ui text-foreground/80" aria-live="polite">{speech}</p>
          <div class="max-h-44 overflow-y-auto @2xl:max-h-72">
            <Restock restock={run.restock} code={run.code} />
          </div>
        {:else}
          {#if watched}
            <p class="flex items-center gap-1.5 self-start rounded-full bg-error px-2.5 py-0.5 text-2xs font-semibold text-background uppercase">
              <SirenIcon class="size-3.5" weight="fill" />Police watching
            </p>
          {/if}
          <div class="flex min-h-16 items-end gap-3 @2xl:flex-col @2xl:items-center @2xl:justify-end">
            {#if customer && patron}
              {#key customer.id}
                <div class="cc-enter relative shrink-0 {customer.leave_at !== null ? 'cc-leave' : ''}">
                  {#if watched || (customer.stage === Stage.DONE && run.jailed)}
                    <Police class="absolute -top-3 left-1/2 size-14 opacity-90 @2xl:-top-6 @2xl:left-2/3 @2xl:size-32" />
                  {/if}
                  <CustomerFace mood={customer.mood} look={patron.look} ears={patron.ears} class="relative size-16 @2xl:size-36" />
                  {#if customer.stage === Stage.DONE && off_by === 0}
                    <span class="cc-float absolute top-1/3 left-[80%] font-mono text-sm font-semibold text-success tabular-nums">
                      +{amount(result?.total ?? 0)}
                    </span>
                  {/if}
                </div>
              {/key}
              <div class="flex min-w-0 flex-1 flex-col gap-1 @2xl:order-first @2xl:w-full @2xl:max-w-64 @2xl:flex-none">
                <p class="flex items-center gap-1.5 text-ui font-semibold">
                  <span class="truncate">{patron_label(patron)}</span>
                  {#if customer.party}<ConfettiIcon class="size-4 shrink-0 text-primary" weight="bold" aria-label="Party order" />{/if}
                </p>
                <div class="flex items-center gap-2">
                  <div
                    class="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/10"
                    role="meter"
                    aria-label="{patron.name}'s trust"
                    aria-valuemin={0}
                    aria-valuemax={MAX_TRUST}
                    aria-valuenow={patron.trust}
                  >
                    <span
                      class="absolute inset-0 origin-left rounded-full transition-transform duration-500 {trust_tone}"
                      style:transform="scaleX({patron.trust / MAX_TRUST})"
                    ></span>
                  </div>
                  <span class="font-mono text-2xs text-foreground/80 tabular-nums">{patron.trust}%</span>
                </div>
                <p class="rounded-xl bg-background-light px-3 py-1.5 text-ui" aria-live="polite">{speech}</p>
              </div>
            {:else}
              <div class="grid size-16 shrink-0 place-items-center text-foreground/20 @2xl:size-36">
                <StorefrontIcon class="size-12 @2xl:size-16" weight="duotone" />
              </div>
              <p class="mb-2 max-w-64 rounded-xl bg-background-light px-3 py-2 text-ui @2xl:order-first @2xl:mb-0" aria-live="polite">
                {speech}
              </p>
            {/if}
          </div>

          <div class="rounded-xl bg-background-light p-1.5 @2xl:p-2" aria-label="Shopping list">
            {#if customer}
              {#key customer.id}
                <ol class="flex max-h-40 flex-col gap-0.5 overflow-y-auto @2xl:max-h-64">
                  {#each customer.items as item, index (index)}
                    {@const info = PRODUCT_INFO[item.product]}
                    {@const done = item.entered !== null}
                    {@const slipped = customer.stage === Stage.DONE && !customer.staffed && item.entered !== item.cents}
                    <li
                      class={cn(
                        "cc-drop flex h-8 items-center gap-2 rounded-md px-2 text-ui",
                        index === current && "bg-primary/12 ring-1 ring-primary/40 ring-inset",
                        slipped && "bg-error/12"
                      )}
                      style:animation-delay="{index * 80}ms"
                      aria-current={index === current ? "true" : undefined}
                    >
                      <info.icon class="size-4 shrink-0 {done ? 'text-foreground/38' : ''}" weight="duotone" />
                      <span class="min-w-0 flex-1 truncate {done ? 'text-foreground/50 line-through' : ''}">{info.name}</span>
                      {#if slipped}
                        <span class="font-mono text-2xs text-error tabular-nums line-through">{watched ? mask(amount(item.entered ?? 0)) : amount(item.entered ?? 0)}</span>
                      {/if}
                      <span class="font-mono tabular-nums {done && !slipped ? 'text-foreground/50 line-through' : ''}">{amount(item.cents)}</span>
                    </li>
                  {/each}
                </ol>
              {/key}
            {:else}
              <p class="flex min-h-8 items-center px-2 text-ui text-foreground/65">
                {run.phase === Phase.WARMUP ? "The shop opens after the warm-up." : "No one at the counter."}
              </p>
            {/if}
          </div>
        {/if}
      </section>

      <section class="flex min-w-0 flex-col gap-2 @2xl:w-72" aria-label="Register">
        <div class="flex flex-col rounded-xl bg-background-light p-2 font-mono text-2xs">
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="uppercase {customer?.stage === Stage.DONE ? (off_by === 0 ? 'text-success' : 'text-error') : 'text-foreground/65'}"
              aria-live="polite"
            >
              {register_label}
            </span>
            <span class="text-xl font-semibold tabular-nums">
              {#if run.phase === Phase.RESTOCK}{run.restock.length} left{:else if customer}{watched
                  ? mask(amount(entered_total(customer)))
                  : amount(entered_total(customer))}{:else}–{/if}
            </span>
          </div>
          {#if customer?.stage === Stage.DONE && result && off_by !== 0}
            <span class="text-right text-foreground/65 tabular-nums">It was {amount(result.total)}</span>
          {/if}
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
            class={cn(
              "flex h-12 min-w-0 flex-1 items-center justify-end overflow-hidden rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 font-mono text-2xl tabular-nums ring-1 ring-foreground/10 ring-inset",
              watched && "text-error ring-error/60",
              miss && "animate-wiggle text-error ring-error/60"
            )}
            aria-label={watched ? "Typed amount, hidden while the police watch" : "Typed amount"}
          >
            {#if display}{display}{:else}<span class="text-foreground/30">{run.phase === Phase.RESTOCK ? "––" : "0"}</span>{/if}
            {#if keypad_on && run.phase !== Phase.WARMUP}<span class="cc-caret ml-0.5 h-6 w-0.5 {watched ? 'bg-error' : 'bg-primary'}"></span>{/if}
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
            {@const digit = /^\d$/.test(key)}
            <button
              type="button"
              class={button({
                variant: "secondary",
                class: cn(
                  "h-10 rounded-lg font-mono text-lg pointer-coarse:h-12 @2xl:h-11",
                  watched && "text-error",
                  shop.lit === key && "bg-primary/20 text-primary",
                  warm_target === key && "bg-success text-background shadow-[0_0_12px_var(--color-success)] hover:bg-success"
                ),
              })}
              aria-label={key === KeypadKey.BACK ? "Backspace" : key === "." ? "Decimal point" : key}
              disabled={!keypad_on || (digits_only && !digit)}
              onclick={() => shop.press(key)}
            >
              {#if key === KeypadKey.BACK}<BackspaceIcon class="size-5" weight="bold" />{:else}{key}{/if}
            </button>
          {/each}
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-1.5">
          <Button
            variant="secondary"
            class="h-10 w-full rounded-lg pointer-coarse:h-12 @2xl:h-11"
            disabled={!hire_ok}
            title="Staff scan the next lists for you (H)"
            onclick={() => shop.hire()}
          >
            <UserPlusIcon class="size-5" weight="bold" />
            {#if run.staff_left > 0}
              Staff ×{run.staff_left}
            {:else}
              Staff <span class="font-mono text-2xs tabular-nums opacity-80">{money(staff_price(run.day))}</span>
            {/if}
          </Button>
          <button
            type="button"
            class={button({
              variant: "primary",
              class: cn("h-10 rounded-lg text-sm pointer-coarse:h-12 @2xl:h-11", shop.lit === KeypadKey.ENTER && "opacity-70"),
            })}
            disabled={!serving || !run.typed}
            onclick={() => shop.press(KeypadKey.ENTER)}
          >
            <KeyReturnIcon class="size-5" weight="bold" />
            Enter
          </button>
        </div>
      </section>
    </div>

    {#if run.phase === Phase.READY}
      <BoardOverlay
        title="Checkout Challenge"
        detail={saved.value
          ? `Day ${saved.value.day} done · Cash ${money(saved.value.money)} · Jail ${saved.value.jail_days}/${MAX_JAIL_DAYS}`
          : undefined}
        class="rounded-none"
      >
        {#if saved.value}
          <Button variant="secondary" onclick={new_shop}>New shop</Button>
          <Button variant="primary" onclick={start}>Continue</Button>
        {:else}
          <p class="basis-full text-ui text-foreground/80"><span class="inline-block max-w-72">
            Warm up, then type each price on the list and press Enter. Give the total to find out if you got it right.
            Wrong change costs trust, and low trust brings the police.
          </span></p>
          <Button variant="primary" onclick={start}>Open the shop</Button>
        {/if}
      </BoardOverlay>
    {:else if run.phase === Phase.DAY_OVER}
      <BoardOverlay
        title={run.jailed ? `Day ${run.day}: a night in jail` : `Day ${run.day} done`}
        detail="Served {run.today.served} · Accuracy {run.today.served ? `${today_accuracy}%` : '–'} · Cash {money(run.money)}"
        class="rounded-none"
      >
        {@render star_row(stars(run.today, run.jailed))}
        {#if run.books}<BooksView books={run.books} class="basis-full justify-self-center px-8 text-left @sm:max-w-56" />{/if}
        <label class="flex basis-full items-center justify-center gap-2 text-ui">
          <Switch checked={run.sale} onchange={() => shop.toggle_sale()} />
          Sale tomorrow: {Math.round(SALE_DISCOUNT * 100)}% off, more regulars
        </label>
        <Button variant="primary" onclick={start}>Open day {run.day + 1}</Button>
      </BoardOverlay>
    {:else if run.phase === Phase.GAME_OVER}
      <BoardOverlay
        title="The shop is closed"
        detail="{MAX_JAIL_DAYS} days in jail · Days {run.days_survived} · Accuracy {run_accuracy}%"
        class="rounded-none"
      >
        <p class="basis-full font-mono text-2xs text-foreground/65 tabular-nums">
          Best {money(best.value.money)} · {best.value.days} days
        </p>
        <Button variant="primary" onclick={start}>New shop</Button>
      </BoardOverlay>
    {/if}
  </div>

  <StatusBar>
    <span class="tabular-nums">Today {money(run.today.money)}</span>
    <span class="tabular-nums">Accuracy {run.today.served ? `${today_accuracy}%` : "–"}</span>
    <span class="hidden tabular-nums @md:inline">Regulars {run.roster.length}</span>
    <span class="hidden tabular-nums @lg:inline">Best {money(best.value.money)}</span>
    <span class="hidden @3xl:inline">Enter rings up · H hires staff</span>
  </StatusBar>
</div>

<style>
  .cc-enter {
    animation: cc-enter 360ms var(--ease-out);
  }

  .cc-leave {
    animation: cc-leave 1700ms var(--ease-in-out) forwards;
  }

  .cc-float {
    animation: cc-float 1000ms var(--ease-out) forwards;
  }

  .cc-caret {
    animation: cc-blink 1s steps(1) infinite;
  }

  .cc-drop {
    animation: cc-drop 260ms var(--ease-out) backwards;
  }

  @keyframes cc-enter {
    from {
      opacity: 0;
      translate: -2rem 0;
    }
  }

  @keyframes cc-leave {
    0%,
    70% {
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

  @keyframes cc-drop {
    from {
      opacity: 0;
      translate: 0 -0.75rem;
    }
  }

  @keyframes cc-blink {
    50% {
      opacity: 0;
    }
  }
</style>
