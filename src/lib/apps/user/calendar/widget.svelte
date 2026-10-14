<script lang="ts">
  import kernel, { type AppsService, type WidgetProps, type WindowsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { Bell } from "phosphor-svelte";
  import { add_days, APP_ID, day_key, day_title, expand, format_day, next_reminder, time_label, time_of, until_label } from "./calendar";
  import { EVENT_DOT } from "./colors";
  import { open_events, remind_while_alive } from "./store.svelte";

  // Hosts reminders too, so a widget on the desktop keeps them coming with no Calendar window open.
  let { size }: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const file = open_events();
  $effect(() => () => file.release());
  remind_while_alive(file);

  const ticker = new Ticker(() => !windows.page_hidden, 30_000);
  const now = $derived(ticker.now);

  const today = $derived(day_key(new Date(now)));
  const week = $derived(size.h >= 4);
  const events = $derived(file.ready ? expand(file.value.events, today, add_days(today, week ? 6 : 0)) : []);
  const upcoming = $derived(file.ready ? next_reminder(file.value.events, now) : null);
</script>

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <button type="button" class="px-3 pt-2.5 pb-1.5 text-left hover:opacity-85" onclick={() => apps.launch(APP_ID, { day: today })} title="Open Calendar">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{format_day(today, { weekday: "long" })}</p>
    <p class="text-lg leading-tight font-semibold">{format_day(today, { month: "long", day: "numeric" })}</p>
  </button>

  <ul class="min-h-0 overflow-auto px-1.5" aria-label={week ? "This week" : "Today"}>
    {#each events as occurrence, index (`${occurrence.event.id}:${occurrence.day}`)}
      {@const ended = !occurrence.event.all_day && occurrence.end <= now}
      {#if occurrence.day !== today && occurrence.day !== events[index - 1]?.day}
        <li class="px-1.5 pt-2 pb-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{day_title(occurrence.day, today)}</li>
      {/if}
      <li>
        <button
          type="button"
          class={cn("flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-foreground/6", ended && "opacity-55")}
          onclick={() => apps.launch(APP_ID, { day: occurrence.day })}
        >
          <span class={cn("size-2 shrink-0 rounded-full", EVENT_DOT[occurrence.event.color])}></span>
          <span class="w-11 shrink-0 font-mono text-2xs text-foreground/80 tabular-nums">{occurrence.event.all_day ? "All day" : occurrence.event.start}</span>
          <span class="min-w-0 flex-1 truncate text-ui" title="{occurrence.event.title} · {time_label(occurrence.event)}">{occurrence.event.title}</span>
        </button>
      </li>
    {:else}
      <li class="px-1.5 py-1 text-ui text-foreground/65">{file.ready ? (week ? "Nothing this week" : "Nothing today") : ""}</li>
    {/each}
  </ul>

  <p class="flex min-w-0 items-center gap-1.5 border-t border-foreground/8 px-3 py-1.5 text-2xs text-foreground/80">
    <Bell class={cn("size-3.5 shrink-0", upcoming && "text-primary")} weight={upcoming ? "fill" : "regular"} />
    {#if upcoming}
      {@const at = new Date(upcoming.at)}
      <span class="truncate"
        ><span class="font-mono font-medium text-foreground tabular-nums">{time_of(at.getHours() * 60 + at.getMinutes())}</span> · {upcoming.occurrence.event.title}, {until_label(
          upcoming.at - now
        )}</span
      >
    {:else}
      <span class="truncate">No reminders set</span>
    {/if}
  </p>
</div>
