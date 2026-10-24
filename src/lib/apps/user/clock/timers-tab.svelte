<script lang="ts">
  import { Badge, Button, IconButton, Input } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { ArrowCounterClockwise, Pause, PencilSimple, Play, Trash } from "phosphor-svelte";
  import { format_duration, MINUTE, timer_remaining, timer_state, TimerState, type Timer } from "./clock";
  import { add_timer, attempt, pause_timer, remove_timer, rename_timer, reset_timer, run_timer } from "./jobs";

  let { timers, now, adding = $bindable(false), onstart }: { timers: Timer[]; now: number; adding?: boolean; onstart: () => void } = $props();

  const PRESETS = [1, 3, 5, 10, 15, 25, 30, 60];
  const FIELD =
    "h-14 w-18 rounded-lg bg-field text-center font-mono text-3xl tabular-nums ring-1 ring-foreground/30 ring-inset [appearance:textfield] focus-visible:outline-2 focus-visible:outline-cottontail [&::-webkit-inner-spin-button]:appearance-none";

  let label = $state("");
  let hours = $state(0);
  let minutes = $state(5);
  let seconds = $state(0);

  const total_ms = $derived(((Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0)) * 1000);
  const show_form = $derived(adding || timers.length === 0);

  function preset(value: number) {
    hours = Math.floor(value / 60);
    minutes = value % 60;
    seconds = 0;
  }

  function create(event: SubmitEvent) {
    event.preventDefault();
    if (total_ms <= 0) return;
    onstart();
    attempt("Couldn't start the timer", add_timer(label, total_ms));
    label = "";
    adding = false;
  }

  function start(timer: Timer) {
    onstart();
    attempt("Couldn't start the timer", run_timer(timer));
  }
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto grid max-w-2xl gap-3 p-2 @md:p-4">
    {#if show_form}
      <form class="grid gap-4 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline" onsubmit={create}>
        <div class="flex flex-wrap items-end justify-center gap-2">
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Hours</span>
            <input type="number" min="0" max="99" bind:value={hours} class={FIELD} />
          </label>
          <span class="pb-2 font-mono text-3xl text-foreground/40">:</span>
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Minutes</span>
            <input type="number" min="0" max="59" bind:value={minutes} class={FIELD} />
          </label>
          <span class="pb-2 font-mono text-3xl text-foreground/40">:</span>
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Seconds</span>
            <input type="number" min="0" max="59" bind:value={seconds} class={FIELD} />
          </label>
        </div>
        <div class="flex flex-wrap justify-center gap-1">
          {#each PRESETS as value (value)}
            <Button size="sm" variant="quiet" pressed={total_ms === value * MINUTE} onclick={() => preset(value)}>{value < 60 ? `${value} min` : `${value / 60} h`}</Button>
          {/each}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Input bind:value={label} size="md" class="min-w-40 flex-1" placeholder="Name, like Dinner" aria-label="Timer name" maxlength={40} />
          {#if timers.length > 0}<Button variant="quiet" onclick={() => (adding = false)}>Cancel</Button>{/if}
          <Button variant="primary" type="submit" disabled={total_ms <= 0}><Play weight="bold" />Start</Button>
        </div>
      </form>
    {/if}

    {#if timers.length > 0}
      <ul class="grid gap-2 @lg:grid-cols-2" aria-label="Timers">
        {#each timers as timer (timer.id)}
          {@const state = timer_state(timer)}
          {@const remaining = timer_remaining(timer, now)}
          {@const progress = 1 - remaining / timer.duration_ms}
          <li class="grid gap-2 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
            <div class="flex min-w-0 items-center gap-2">
              <label class="group flex min-w-0 flex-1 items-center gap-1">
                <Input
                  value={timer.label}
                  size="sm"
                  class="min-w-0 flex-1 bg-transparent px-1 font-medium ring-transparent focus-visible:ring-2 focus-visible:ring-cottontail"
                  placeholder={format_duration(timer.duration_ms)}
                  aria-label="Timer name"
                  maxlength={40}
                  onchange={(event) => attempt("Couldn't rename the timer", rename_timer(timer, event.currentTarget.value))}
                  onkeydown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                />
                <PencilSimple class="size-3.5 shrink-0 text-foreground/45 group-focus-within:hidden" aria-hidden="true" />
              </label>
              {#if state === TimerState.DONE}<Badge tone="success">Done</Badge>{:else if state === TimerState.PAUSED}<Badge>Paused</Badge>{/if}
              <IconButton label="Delete timer" size="sm" onclick={() => attempt("Couldn't delete the timer", remove_timer(timer))}><Trash /></IconButton>
            </div>
            <p class={cn("font-mono text-4xl font-medium tabular-nums", state !== TimerState.RUNNING && "text-foreground/80")}>{format_time(Math.ceil(remaining / 1000) * 1000)}</p>
            <div class="h-1 overflow-hidden rounded-full bg-field shadow-track" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Elapsed">
              <div class="h-full rounded-full bg-primary" style:width="{Math.min(100, progress * 100)}%"></div>
            </div>
            <div class="flex items-center gap-2">
              {#if state === TimerState.RUNNING}
                <Button size="sm" onclick={() => attempt("Couldn't pause the timer", pause_timer(timer))}><Pause weight="bold" />Pause</Button>
              {:else}
                <Button size="sm" onclick={() => start(timer)}>
                  <Play weight="bold" />{state === TimerState.PAUSED ? "Resume" : state === TimerState.DONE ? "Restart" : "Start"}
                </Button>
              {/if}
              {#if state !== TimerState.IDLE}
                <Button size="sm" variant="quiet" onclick={() => attempt("Couldn't reset the timer", reset_timer(timer))}><ArrowCounterClockwise weight="bold" />Reset</Button>
              {/if}
              <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{format_duration(timer.duration_ms)}</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
