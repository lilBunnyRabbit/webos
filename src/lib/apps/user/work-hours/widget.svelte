<script lang="ts">
  import kernel, { NotificationType, type AppsService, type NotificationsService, type WidgetProps, type WindowsService } from "$lib/core/api";
  import { Button } from "$lib/core/components/ui";
  import type { JsonFile } from "$lib/core/contexts/app";
  import { format_time } from "$lib/core/games";
  import { Play, Stop } from "phosphor-svelte";
  import { clock_time, day_key, day_minutes, format_hours, month_key, running_minutes, WORK_HOURS_APP_ID, type MonthFile } from "./data";
  import { clock_in, clock_out, open_month, open_state } from "./store";

  let {}: WidgetProps = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  let now = $state(new Date());
  const today = $derived(day_key(now));
  const month = $derived(month_key(now));

  const state_file = open_state();
  $effect(() => () => state_file.release());

  let month_file = $state.raw<JsonFile<MonthFile> | null>(null);
  $effect(() => {
    const handle = open_month(month);
    month_file = handle;
    return () => handle.release();
  });

  const running = $derived(state_file.ready ? state_file.value.running : null);

  $effect(() => {
    if (windows.page_hidden) return;
    now = new Date();
    const timer = setInterval(() => (now = new Date()), running ? 1000 : 30_000);
    return () => clearInterval(timer);
  });

  const booked = $derived(month_file?.ready ? day_minutes(month_file.value.days[today]) : 0);
  const running_today = $derived(running && day_key(new Date(running.start)) === today ? running_minutes(running, now) : 0);

  async function toggle() {
    if (!state_file.ready) return;
    try {
      await (running ? clock_out() : clock_in());
    } catch (error) {
      notifications.notify(WORK_HOURS_APP_ID, { type: NotificationType.ERROR, title: "Couldn't book the session", message: String(error) });
    }
  }
</script>

<div class="flex h-full flex-col justify-between gap-2 p-3">
  <button type="button" class="min-w-0 text-left" onclick={() => apps.launch(WORK_HOURS_APP_ID)} title="Open Work Hours">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Today</p>
    <p class="font-mono text-2xl font-medium tabular-nums">{format_hours(booked + running_today)}</p>
    <p class="truncate font-mono text-2xs tabular-nums text-foreground/65">
      {#if running}
        <span class="text-primary">{format_time(now.getTime() - new Date(running.start).getTime())}</span> since {clock_time(new Date(running.start))}
      {:else}
        Clocked out
      {/if}
    </p>
  </button>
  <Button variant={running ? "secondary" : "primary"} size="sm" class="w-full" disabled={!state_file.ready} onclick={toggle}>
    {#if running}<Stop weight="fill" />Clock out{:else}<Play weight="fill" />Clock in{/if}
  </Button>
</div>
