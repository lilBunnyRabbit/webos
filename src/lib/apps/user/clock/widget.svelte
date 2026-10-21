<script lang="ts">
  import kernel, { type AppsService, type SchedulerService, type WidgetProps, type WindowsService, WidgetStyle } from "$lib/core/api";
  import { cn, format_date, clamp, pad2 } from "$lib/core/utils";
  import { format_time } from "$kit/games";
  import { Alarm as AlarmIcon, Hourglass as HourglassIcon, SquaresFour as SquaresFourIcon, Timer as TimerIcon } from "phosphor-svelte";
  import AnalogFace from "./analog-face.svelte";
  import {
    ActiveKind,
    active_items,
    APP_ID,
    clock_alarms,
    clock_timers,
    ClockFace,
    ClockTab,
    fit_items,
    format_hm,
    format_until,
    stopwatch_elapsed,
    stopwatch_of,
    timer_remaining,
    widget_slots,
  } from "./clock";
  import { open_clock_file } from "./jobs";
  import { ring_while_alive } from "./ringer.svelte";
  import { Ticker } from "$lib/core/utils/ticker.svelte";

  let { props, size, style }: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  const file = open_clock_file();
  $effect(() => () => file.release());
  ring_while_alive(APP_ID);

  const ticker = new Ticker(
    () => !windows.page_hidden,
    () => (fast ? 250 : 1000)
  );
  const face = $derived(props.face === ClockFace.DIGITAL ? ClockFace.DIGITAL : ClockFace.ANALOG);
  const date = $derived(new Date(ticker.now));
  const timers = $derived(file.ready ? clock_timers(scheduler.jobs, file.value) : []);
  const alarms = $derived(file.ready ? clock_alarms(scheduler.jobs, file.value) : []);
  const stopwatch = $derived(stopwatch_of(file.value));
  const items = $derived(file.ready ? active_items({ alarms, timers, stopwatch }, ticker.now) : []);
  const fast = $derived(timers.some((entry) => entry.end_at !== null) || stopwatch.started_at !== null);
  const lines = $derived(fit_items(items, widget_slots(size.h)));

  // Straight on the wallpaper: no dial fill or divider, and a soft shadow so the digits read on any background.
  const bare = $derived(style === WidgetStyle.CLEAR);
  const weekday = $derived(date.toLocaleDateString("en-US", { weekday: "long" }));
  const line_class = $derived(
    cn(
      "flex min-w-0 items-center justify-center gap-1.5 px-2 py-1 text-2xs hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none",
      bare ? "rounded-lg text-foreground/85" : "text-foreground/65"
    )
  );
  const VALUE = "font-mono font-medium text-foreground tabular-nums";
</script>

<div class={cn("grid h-full grid-rows-[minmax(0,1fr)_auto]", bare && "bare-text")}>
  {#if face === ClockFace.ANALOG}
    <div class="grid min-h-0 place-items-center p-2">
      <AnalogFace now={ticker.now} {bare} class="h-full max-h-full max-w-full" />
    </div>
  {:else}
    <div class="grid min-h-0 content-center justify-items-center gap-[2cqh] px-3 [container-type:size]">
      <p class="font-mono text-[min(19cqw,42cqh)] leading-none font-bold tabular-nums">
        {pad2(date.getHours())}:{pad2(date.getMinutes())}<span class={cn("text-[0.4em] font-normal", bare ? "text-foreground/75" : "text-foreground/55")}>:{pad2(date.getSeconds())}</span>
      </p>
      <p class={cn("max-w-full truncate text-[clamp(0.6875rem,min(5.5cqw,12cqh),1.125rem)]", bare ? "text-foreground/85" : "text-foreground/65")}>{weekday}, {format_date(date)}</p>
    </div>
  {/if}

  <ul class={cn("grid min-w-0", !bare && "border-t border-foreground/8")} aria-label="Running">
    {#each lines.shown as item (item.key)}
      <li class="grid">
        <button type="button" class={line_class} onclick={() => apps.launch(APP_ID, { tab: item.tab })}>
          {#if item.kind === ActiveKind.TIMER}
            <HourglassIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
            <span class="truncate"><span class={VALUE}>{format_time(Math.ceil(timer_remaining(item.timer, ticker.now) / 1000) * 1000)}</span> · {item.timer.label || "Timer"}{item.timer.end_at === null ? ", paused" : ""}</span>
          {:else if item.kind === ActiveKind.STOPWATCH}
            <TimerIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
            <span class="truncate"><span class={VALUE}>{format_time(stopwatch_elapsed(item.stopwatch, ticker.now))}</span> · Stopwatch{item.stopwatch.started_at === null ? ", paused" : ""}</span>
          {:else}
            <AlarmIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
            <span class="truncate"><span class={VALUE}>{format_hm(item.at)}</span> · {item.alarm.label || format_until(item.at - ticker.now)}</span>
          {/if}
        </button>
      </li>
    {:else}
      <li class="grid">
        <button type="button" class={line_class} onclick={() => apps.launch(APP_ID, { tab: ClockTab.ALARMS })}>
          <AlarmIcon class="size-3.5 shrink-0" />
          <span class="truncate">No alarms set</span>
        </button>
      </li>
    {/each}
    {#if lines.more > 0}
      <li class="grid">
        <button type="button" class={line_class} onclick={() => apps.launch(APP_ID, { tab: ClockTab.ALL })}>
          <SquaresFourIcon class="size-3.5 shrink-0" />
          <span class="truncate">+{lines.more} more</span>
        </button>
      </li>
    {/if}
  </ul>
</div>
