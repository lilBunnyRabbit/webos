<script lang="ts">
  import kernel, { type AppsService, type WidgetProps, type WindowsService } from "$lib/core/api";
  import { format_date, clamp, pad2 } from "$lib/core/utils";
  import { format_time } from "$lib/core/games";
  import { Alarm as AlarmIcon, Timer as TimerIcon } from "phosphor-svelte";
  import AnalogFace from "./analog-face.svelte";
  import { APP_ID, ClockFace, ClockTab, format_hm, format_until, next_alarm, timer_remaining } from "./clock";
  import { gate_clock_file, open_clock_file, ring_while_alive } from "./ringer.svelte";
  import { Ticker } from "$lib/core/utils/ticker.svelte";

  // Rings alarms and timers too, so a pinned widget keeps them working with no Clock window open.
  let { props }: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const handle = open_clock_file();
  $effect(() => () => handle.release());
  const file = gate_clock_file(handle);
  ring_while_alive(file);

  const ticker = new Ticker(() => !windows.page_hidden, 250);
  const face = $derived(props.face === ClockFace.DIGITAL ? ClockFace.DIGITAL : ClockFace.ANALOG);
  const date = $derived(new Date(ticker.now));
  const upcoming = $derived(file.ready ? next_alarm(file.value.alarms, ticker.now) : null);
  const timer = $derived.by(() => {
    const running = file.ready ? file.value.timers.filter((entry) => entry.end_at !== null) : [];
    running.sort((a, b) => (a.end_at ?? 0) - (b.end_at ?? 0));
    return running[0] ?? null;
  });

  const weekday = $derived(date.toLocaleDateString("en-US", { weekday: "long" }));
</script>

<div class="grid h-full grid-rows-[minmax(0,1fr)_auto]">
  {#if face === ClockFace.ANALOG}
    <div class="grid min-h-0 place-items-center p-2">
      <AnalogFace now={ticker.now} class="h-full max-h-full max-w-full" />
    </div>
  {:else}
    <div class="grid min-h-0 content-center justify-items-center gap-[2cqh] px-3 [container-type:size]">
      <p class="font-mono text-[min(19cqw,42cqh)] leading-none font-bold tabular-nums">
        {pad2(date.getHours())}:{pad2(date.getMinutes())}<span class="text-[0.4em] font-normal text-foreground/55">:{pad2(date.getSeconds())}</span>
      </p>
      <p class="max-w-full truncate text-[clamp(0.6875rem,min(5.5cqw,12cqh),1.125rem)] text-foreground/65">{weekday}, {format_date(date)}</p>
    </div>
  {/if}

  <button
    type="button"
    class="flex min-w-0 items-center justify-center gap-1.5 border-t border-foreground/8 px-2 py-1.5 text-2xs text-foreground/65 hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none"
    onclick={() => apps.launch(APP_ID, { tab: timer && !upcoming ? ClockTab.TIMERS : ClockTab.ALARMS })}
  >
    {#if upcoming}
      <AlarmIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
      <span class="truncate"><span class="font-mono font-medium text-foreground tabular-nums">{format_hm(upcoming.at)}</span> · {upcoming.alarm.label || format_until(upcoming.at - ticker.now)}</span>
    {:else if timer}
      <TimerIcon class="size-3.5 shrink-0 text-primary" weight="fill" />
      <span class="truncate"><span class="font-mono font-medium text-foreground tabular-nums">{format_time(timer_remaining(timer, ticker.now))}</span> · {timer.label || "Timer"}</span>
    {:else}
      <AlarmIcon class="size-3.5 shrink-0" />
      <span class="truncate">No alarms set</span>
    {/if}
  </button>
</div>
