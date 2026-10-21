<script lang="ts">
  import { Button, EmptyState, IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, CookingPot as CookingPotIcon, Sun as SunIcon, Timer as TimerIcon, X as XIcon } from "phosphor-svelte";
  import { adjust, format_amount, timer_ms } from "./amounts";
  import type { UnitSystem } from "./constants";
  import type { Ingredient, Recipe, Timer } from "./cooklang";
  import StepText from "./step-text.svelte";
  import { format_countdown } from "./timers";
  import type { CookTimers } from "./timers.svelte";

  interface Props {
    recipe: Recipe;
    factor: number;
    system: UnitSystem;
    timers: CookTimers;
    index: number;
  }

  let { recipe, factor, system, timers, index = $bindable() }: Props = $props();

  const all = $derived(
    recipe.sections.flatMap((section) =>
      section.blocks.flatMap((block) => (block.kind === "step" ? [{ step: block, section: section.name }] : []))
    )
  );
  const current = $derived(all[Math.min(index, all.length - 1)]);
  const ingredients = $derived(current ? current.step.items.filter((item): item is Ingredient => item.kind === "ingredient") : []);
  const step_timers = $derived(current ? current.step.items.filter((item): item is Timer => item.kind === "timer") : []);

  let awake = $state(false);

  // Arrow keys turn steps only when no radio or field has focus, and the view switch that opened cook mode is one.
  const focus_once = (node: HTMLElement) => node.focus({ preventScroll: true });

  export function go(delta: number) {
    index = Math.max(0, Math.min(all.length - 1, index + delta));
  }

  function timer_label(timer: Timer) {
    return timer.name || (current ? `Step ${current.step.number}${current.section ? ` · ${current.section}` : ""}` : "Timer");
  }

  function start(timer: Timer) {
    const ms = timer_ms(timer.amount);
    if (ms !== null) timers.start(timer_label(timer), ms);
  }

  $effect(() => {
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!live) return void sentinel.release();
        lock = sentinel;
        awake = true;
        sentinel.addEventListener("release", () => {
          lock = null;
          awake = false;
        });
      } catch {
        awake = false;
      }
    };
    document.addEventListener("visibilitychange", acquire);
    void acquire();
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  });
</script>

{#if !current}
  <EmptyState icon={CookingPotIcon} title="No steps to cook" description="Write the method as paragraphs, one per step." />
{:else}
  <section aria-label="Cook mode" class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-3 px-4 pt-3">
      <p class="min-w-0 flex-1 truncate text-ui text-foreground/65">
        Step {index + 1} of {all.length}{current.section ? ` · ${current.section}` : ""}
      </p>
      <span class={cn("flex items-center gap-1 text-2xs", awake ? "text-foreground/65" : "text-foreground/40")} title={awake ? "The screen stays on while cook mode is open" : "This browser didn't keep the screen on"}>
        <SunIcon class="size-3.5" weight={awake ? "fill" : "regular"} />{awake ? "Screen on" : "Screen may sleep"}
      </span>
    </div>
    <div class="mx-4 mt-2 h-1 shrink-0 overflow-hidden rounded-full bg-foreground/8" aria-hidden="true">
      <div class="h-full rounded-full bg-primary transition-[width] duration-200" style:width={`${((index + 1) / all.length) * 100}%`}></div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 @lg:px-8">
      <p class="max-w-3xl text-2xl leading-snug text-balance @lg:text-3xl @lg:leading-snug" aria-live="polite">
        <StepText items={current.step.items} {factor} {system} ontimer={start} />
      </p>

      {#if ingredients.length > 0}
        <ul class="flex flex-wrap gap-2" aria-label="Ingredients in this step">
          {#each ingredients as item, item_index (item_index)}
            <li class="rounded-lg bg-foreground/6 px-3 py-2 text-sm">
              <span class="font-mono text-xs text-foreground/80">{format_amount(adjust(item.amount, factor, system))}</span>
              {item.name}
            </li>
          {/each}
        </ul>
      {/if}

      {#if step_timers.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each step_timers as timer, timer_index (timer_index)}
            <Button size="lg" variant="secondary" disabled={timer_ms(timer.amount) === null} onclick={() => start(timer)}>
              <TimerIcon />Start {timer.name ? `${timer.name} ` : ""}{format_amount(timer.amount)}
            </Button>
          {/each}
        </div>
      {/if}
    </div>

    {#if timers.list.length > 0}
      <ul class="flex shrink-0 flex-wrap gap-2 border-t border-foreground/8 bg-background-light px-4 py-2" aria-label="Timers">
        {#each timers.list as timer (timer.id)}
          <li class={cn("flex items-center gap-2 rounded-lg py-1 pr-1 pl-3", timer.done ? "bg-success/12 text-success" : "bg-tertiary/12 text-tertiary")}>
            <TimerIcon class="size-4" weight={timer.done ? "fill" : "regular"} />
            <span class="max-w-40 truncate text-ui">{timer.label}</span>
            {#if timer.done}
              <span class="text-sm font-medium">Done</span>
            {:else}
              <span class="font-mono text-sm tabular-nums" role="timer">{format_countdown(timers.remaining(timer))}</span>
            {/if}
            <IconButton size="sm" label={timer.done ? `Clear ${timer.label}` : `Cancel ${timer.label}`} onclick={() => timers.cancel(timer.id)}><XIcon /></IconButton>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="grid shrink-0 grid-cols-2 gap-2 border-t border-foreground/8 bg-background-light p-3">
      <Button size="lg" disabled={index === 0} onclick={() => go(-1)}><ArrowLeftIcon />Back</Button>
      <Button size="lg" variant="primary" disabled={index >= all.length - 1} onclick={() => go(1)} {@attach focus_once}>Next<ArrowRightIcon /></Button>
    </div>
  </section>
{/if}
