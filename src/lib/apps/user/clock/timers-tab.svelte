<script lang="ts">
  import { Badge, Button, IconButton, Input } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { ArrowCounterClockwise, Pause, PencilSimple, Play, Trash } from "phosphor-svelte";
  import { format_duration, MINUTE, new_id, pause_timer, reset_timer, start_timer, timer_remaining, timer_state, TimerState, type Timer } from "./clock";
  import type { ClockFile } from "./ringer.svelte";

  let { file, now, adding = $bindable(false), onstart }: { file: ClockFile; now: number; adding?: boolean; onstart: () => void } = $props();

  const PRESETS = [1, 3, 5, 10, 15, 25, 30, 60];
  const FIELD =
    "h-14 w-18 rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] text-center font-mono text-3xl tabular-nums ring-1 ring-foreground/30 ring-inset [appearance:textfield] focus-visible:outline-2 focus-visible:outline-cottontail [&::-webkit-inner-spin-button]:appearance-none";

  let label = $state("");
  let hours = $state(0);
  let minutes = $state(5);
  let seconds = $state(0);

  const total_ms = $derived(((Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0)) * 1000);
  const timers = $derived(file.value.timers);
  const show_form = $derived(adding || timers.length === 0);

  function preset(value: number) {
    hours = Math.floor(value / 60);
    minutes = value % 60;
    seconds = 0;
  }

  function create(event: SubmitEvent) {
    event.preventDefault();
    if (total_ms <= 0) return;
    const timer: Timer = { id: new_id(), label: label.trim(), duration_ms: total_ms, end_at: null, remaining_ms: total_ms };
    file.value.timers.push(start_timer(timer, Date.now()));
    label = "";
    adding = false;
    onstart();
  }

  function update(timer: Timer, next: Timer) {
    const index = file.value.timers.findIndex((entry) => entry.id === timer.id);
    if (index >= 0) file.value.timers[index] = next;
  }

  function remove(timer: Timer) {
    file.value.timers = file.value.timers.filter((entry) => entry.id !== timer.id);
  }
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto grid max-w-2xl gap-3 p-2 @md:p-4">
    {#if show_form}
      <form class="grid gap-4 rounded-xl bg-background-light p-4" onsubmit={create}>
        <div class="flex flex-wrap items-end justify-center gap-2">
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Hours</span>
            <input type="number" min="0" max="99" bind:value={hours} class={FIELD} />
          </label>
          <span class="pb-2 font-mono text-3xl text-foreground/40">:</span>
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Minutes</span>
            <input type="number" min="0" max="59" bind:value={minutes} class={FIELD} />
          </label>
          <span class="pb-2 font-mono text-3xl text-foreground/40">:</span>
          <label class="grid justify-items-center gap-1">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Seconds</span>
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
          <li class="grid gap-2 rounded-xl bg-background-light p-3">
            <div class="flex min-w-0 items-center gap-2">
              <label class="group flex min-w-0 flex-1 items-center gap-1">
                <Input
                  value={timer.label}
                  size="sm"
                  class="min-w-0 flex-1 bg-transparent px-1 font-medium ring-transparent pointer-fine:hover:ring-foreground/20 focus-visible:ring-foreground/30"
                  placeholder={format_duration(timer.duration_ms)}
                  aria-label="Timer name"
                  maxlength={40}
                  onchange={(event) => update(timer, { ...timer, label: event.currentTarget.value.trim() })}
                  onkeydown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                />
                <PencilSimple class="size-3.5 shrink-0 text-foreground/45 group-focus-within:hidden" aria-hidden="true" />
              </label>
              {#if state === TimerState.DONE}<Badge tone="success">Done</Badge>{:else if state === TimerState.PAUSED}<Badge>Paused</Badge>{/if}
              <IconButton label="Delete timer" size="sm" onclick={() => remove(timer)}><Trash /></IconButton>
            </div>
            <p class={cn("font-mono text-4xl font-medium tabular-nums", state !== TimerState.RUNNING && "text-foreground/65")}>{format_time(Math.ceil(remaining / 1000) * 1000)}</p>
            <div class="h-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Elapsed">
              <div class="h-full rounded-full bg-primary" style:width="{Math.min(100, progress * 100)}%"></div>
            </div>
            <div class="flex items-center gap-2">
              {#if state === TimerState.RUNNING}
                <Button size="sm" onclick={() => update(timer, pause_timer(timer, Date.now()))}><Pause weight="bold" />Pause</Button>
              {:else}
                <Button size="sm" onclick={() => update(timer, start_timer(timer, Date.now()))}>
                  <Play weight="bold" />{state === TimerState.PAUSED ? "Resume" : state === TimerState.DONE ? "Restart" : "Start"}
                </Button>
              {/if}
              {#if state !== TimerState.IDLE}
                <Button size="sm" variant="quiet" onclick={() => update(timer, reset_timer(timer))}><ArrowCounterClockwise weight="bold" />Reset</Button>
              {/if}
              <span class="ml-auto font-mono text-2xs text-foreground/55 tabular-nums">{format_duration(timer.duration_ms)}</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
