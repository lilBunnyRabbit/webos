<script lang="ts">
  import { Badge, Button, EmptyState, Switch } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import {
    Alarm as AlarmIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CaretRight as CaretRightIcon,
    Flag as FlagIcon,
    GlobeHemisphereWest as GlobeHemisphereWestIcon,
    Hourglass as HourglassIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SquaresFour as SquaresFourIcon,
    Stop as StopIcon,
    Timer as TimerIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import {
    ActiveKind,
    active_items,
    ClockTab,
    EMPTY_STOPWATCH,
    format_duration,
    format_hm,
    format_stopwatch,
    format_until,
    is_stopwatch_active,
    lap_stopwatch,
    is_snoozed,
    next_alarm,
    repeat_label,
    stopwatch_elapsed,
    stopwatch_of,
    timer_remaining,
    toggle_stopwatch,
    type Alarm,
    type StopwatchState,
    type Timer,
  } from "./clock";
  import { attempt, pause_timer, remove_timer, run_timer, switch_alarm, type ClockFile } from "./jobs";
  import { format_wall, is_zone, local_zone, parse_entry, wall_time } from "./zones";

  let {
    file,
    alarms,
    timers: all_timers,
    now,
    visible,
    onopen,
    onnewtimer,
    onnewalarm,
  }: {
    file: ClockFile;
    alarms: Alarm[];
    timers: Timer[];
    now: number;
    visible: boolean;
    onopen: (tab: ClockTab) => void;
    onnewtimer: () => void;
    onnewalarm: () => void;
  } = $props();

  const stopwatch = $derived(stopwatch_of(file.value));
  const timers = $derived(
    active_items({ alarms, timers: all_timers, stopwatch }, now).flatMap((item) => (item.kind === ActiveKind.TIMER ? [item.timer] : []))
  );
  const running = $derived(stopwatch.started_at !== null);
  const fast = new Ticker(
    () => visible && running,
    () => 40
  );
  const elapsed = $derived(stopwatch_elapsed(stopwatch, running ? fast.now : 0));
  const upcoming = $derived(next_alarm(alarms, now));
  const home = local_zone();
  const places = $derived(file.value.zones.map(parse_entry).filter((place) => is_zone(place.zone)));
  const idle = $derived(timers.length === 0 && !is_stopwatch_active(stopwatch) && !upcoming);

  function set_stopwatch(next: StopwatchState) {
    file.value.stopwatch = next;
  }

  function toggle_alarm(alarm: Alarm, on: boolean) {
    attempt("Couldn't switch the alarm", switch_alarm(alarm.job, on));
  }
</script>

{#snippet header(Icon: Component, title: string, tab: ClockTab, label: string)}
  <button
    type="button"
    class="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-t-xl px-3 text-sm font-semibold hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:min-h-11"
    aria-label={label}
    onclick={() => onopen(tab)}
  >
    <Icon class="size-4 shrink-0 text-foreground/65" weight="fill" />
    <span class="min-w-0 flex-1 truncate text-left">{title}</span>
    <CaretRightIcon class="size-3.5 shrink-0 text-foreground/65" />
  </button>
{/snippet}

<div class="h-full overflow-auto">
  <div class="mx-auto grid max-w-4xl gap-3 p-2 @md:p-4">
    {#if idle}
      <EmptyState icon={SquaresFourIcon} title="Nothing running" description="Timers, the stopwatch and your next alarm show up here together." class="h-auto p-6">
        {#snippet actions()}
          <div class="flex flex-wrap justify-center gap-2">
            <Button size="sm" onclick={onnewtimer}><HourglassIcon weight="bold" />Timer</Button>
            <Button size="sm" onclick={() => set_stopwatch(toggle_stopwatch(stopwatch, Date.now()))}><TimerIcon weight="bold" />Stopwatch</Button>
            <Button size="sm" onclick={onnewalarm}><AlarmIcon weight="bold" />Alarm</Button>
          </div>
        {/snippet}
      </EmptyState>
    {/if}

    <ul class="grid items-start gap-2 @xl:grid-cols-2" aria-label="Everything in Clock">
      {#each timers as timer (timer.id)}
        {@const remaining = timer_remaining(timer, now)}
        {@const progress = 1 - remaining / timer.duration_ms}
        {@const paused = timer.end_at === null}
        {@const name = timer.label || format_duration(timer.duration_ms)}
        <li class="grid rounded-xl bg-background-light ring-1 ring-foreground/8">
          {@render header(HourglassIcon, name, ClockTab.TIMERS, `Open timers (${name})`)}
          <div class="grid gap-2 px-3 pb-3">
            <div class="flex items-baseline gap-2">
              <p class={cn("font-mono text-3xl font-medium tabular-nums", paused && "text-foreground/80")}>{format_time(Math.ceil(remaining / 1000) * 1000)}</p>
              {#if paused}<Badge>Paused</Badge>{/if}
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Elapsed">
              <div class="h-full rounded-full bg-primary" style:width="{Math.min(100, progress * 100)}%"></div>
            </div>
            <div class="flex items-center gap-2">
              {#if paused}
                <Button size="sm" onclick={() => attempt("Couldn't resume the timer", run_timer(timer))}><PlayIcon weight="bold" />Resume</Button>
              {:else}
                <Button size="sm" onclick={() => attempt("Couldn't pause the timer", pause_timer(timer))}><PauseIcon weight="bold" />Pause</Button>
              {/if}
              <Button size="sm" variant="quiet" onclick={() => attempt("Couldn't stop the timer", remove_timer(timer))}><StopIcon weight="bold" />Stop</Button>
            </div>
          </div>
        </li>
      {/each}

      {#if !idle}
        <li class="grid rounded-xl bg-background-light ring-1 ring-foreground/8">
          {@render header(TimerIcon, stopwatch.laps.length ? `Stopwatch · ${stopwatch.laps.length} lap${stopwatch.laps.length === 1 ? "" : "s"}` : "Stopwatch", ClockTab.STOPWATCH, "Open the stopwatch")}
          <div class="grid gap-2 px-3 pb-3">
            <p class={cn("font-mono text-3xl font-medium tabular-nums", !running && "text-foreground/80")} aria-live="off">{format_stopwatch(elapsed)}</p>
            <div class="flex items-center gap-2">
              <Button size="sm" variant={running ? "secondary" : "primary"} onclick={() => set_stopwatch(toggle_stopwatch(stopwatch, Date.now()))}>
                {#if running}<PauseIcon weight="bold" />Pause{:else}<PlayIcon weight="bold" />{elapsed > 0 ? "Resume" : "Start"}{/if}
              </Button>
              {#if running}
                <Button size="sm" variant="quiet" onclick={() => set_stopwatch(lap_stopwatch(stopwatch, Date.now()))}><FlagIcon weight="bold" />Lap</Button>
              {:else if elapsed > 0}
                <Button size="sm" variant="quiet" onclick={() => set_stopwatch(structuredClone(EMPTY_STOPWATCH))}><ArrowCounterClockwiseIcon weight="bold" />Reset</Button>
              {/if}
            </div>
          </div>
        </li>
      {/if}

      {#if upcoming}
        {@const alarm = upcoming.alarm}
        <li class="grid rounded-xl bg-background-light ring-1 ring-foreground/8">
          {@render header(AlarmIcon, "Next alarm", ClockTab.ALARMS, "Open alarms")}
          <div class="flex items-center gap-3 px-3 pb-3">
            <span class="grid min-w-0 flex-1">
              <span class="font-mono text-3xl font-medium tabular-nums">{format_hm(upcoming.at)}</span>
              <span class="truncate text-2xs text-foreground/65">
                {[alarm.label, repeat_label(alarm.days)].filter(Boolean).join(" · ")}<span class="text-primary">{` · ${is_snoozed(alarm, now) ? "snoozed, rings " : ""}${format_until(upcoming.at - now)}`}</span>
              </span>
            </span>
            <Switch checked={alarm.on} aria-label="{alarm.time} alarm on" onchange={(event) => toggle_alarm(alarm, event.currentTarget.checked)} />
          </div>
        </li>
      {/if}

      <li class="grid rounded-xl bg-background-light ring-1 ring-foreground/8">
        {@render header(GlobeHemisphereWestIcon, "World clock", ClockTab.WORLD, "Open the world clock")}
        <ul class="grid gap-x-4 px-3 pb-2 @md:grid-cols-2" aria-label="Cities">
          <li class="flex min-h-8 items-center gap-2 text-ui">
            <span class="min-w-0 flex-1 truncate text-foreground/65">Here</span>
            <span class="font-mono font-medium tabular-nums">{format_wall(wall_time(now, home))}</span>
          </li>
          {#each places as place (place.entry)}
            <li class="flex min-h-8 items-center gap-2 text-ui">
              <span class="min-w-0 flex-1 truncate font-medium">{place.name}</span>
              <span class="font-mono font-medium tabular-nums">{format_wall(wall_time(now, place.zone))}</span>
            </li>
          {/each}
        </ul>
      </li>
    </ul>
  </div>
</div>
