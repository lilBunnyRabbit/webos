<script lang="ts">
  import kernel, { NotificationType, Platform, type DesktopItem, type DesktopService, type DialogsService, type NotificationsService } from "$lib/core/api";
  import { Button, Segmented, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Alarm as AlarmIcon, Clock, GlobeHemisphereWest, Hourglass, Plus, Sticker, Timer as TimerIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AlarmsTab from "./alarms-tab.svelte";
  import {
    ClockDataSchema,
    ClockFace,
    ClockTab,
    DATA_FILE,
    EMPTY_CLOCK,
    EMPTY_STOPWATCH,
    format_hm,
    format_until,
    laps_of,
    next_alarm,
    StopwatchSchema,
    type Alarm,
    type AlarmDraft,
  } from "./clock";
  import { gate_clock_file, ring_while_alive } from "./ringer.svelte";
  import StopwatchTab from "./stopwatch-tab.svelte";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import TimersTab from "./timers-tab.svelte";
  import WorldTab from "./world-tab.svelte";
  import { format_utc_offset, local_zone, zone_offset } from "./zones";

  const { tab: initial_tab }: { tab?: ClockTab } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const file = gate_clock_file(storage.file(DATA_FILE, EMPTY_CLOCK, ClockDataSchema));
  const stopwatch = storage.persisted("stopwatch", EMPTY_STOPWATCH, StopwatchSchema);
  const tab = storage.window<ClockTab>("tab", untrack(() => initial_tab ?? ClockTab.WORLD), z.enum(ClockTab));

  ring_while_alive(file);
  const ticker = new Ticker(() => win.is_visible, 250);

  let adding_zone = $state(false);
  let adding_timer = $state(false);
  let draft = $state<AlarmDraft | null>(null);

  const can_pin = kernel.platform !== Platform.MOBILE;

  const tabs = [
    { value: ClockTab.WORLD, label: "World", icon: GlobeHemisphereWest },
    { value: ClockTab.ALARMS, label: "Alarms", icon: AlarmIcon },
    { value: ClockTab.TIMERS, label: "Timer", icon: Hourglass },
    { value: ClockTab.STOPWATCH, label: "Stopwatch", icon: TimerIcon },
  ];

  /** Asked from the click that creates the first alarm or timer, so the browser shows its prompt. */
  function ask_permission() {
    void notifications.request_system();
  }

  function new_alarm() {
    const next_hour = new Date(Date.now() + 3_600_000);
    draft = { id: null, time: `${String(next_hour.getHours()).padStart(2, "0")}:00`, days: [], label: "" };
  }

  async function delete_alarm(alarm: Alarm) {
    const name = alarm.label ? `“${alarm.label}” (${alarm.time})` : `the ${alarm.time} alarm`;
    if (!(await win.confirm(`Delete ${name}?`, { confirm_label: "Delete", danger: true }))) return;
    file.value.alarms = file.value.alarms.filter((entry) => entry.id !== alarm.id);
    draft = null;
  }

  function widget_on_desktop() {
    return desktop.items().find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id);
  }

  async function toggle_widget(anchor: { x: number; y: number }) {
    const existing = widget_on_desktop();
    try {
      if (existing) {
        await desktop.remove_item(existing.name);
        notifications.notify(app_id, { title: "Removed from the desktop", message: existing.label });
        return;
      }
      const face = await dialogs.menu(
        [
          { id: ClockFace.ANALOG, label: "Analog clock", icon: Clock },
          { id: ClockFace.DIGITAL, label: "Digital clock", icon: TimerIcon },
        ],
        { anchor }
      );
      if (face !== ClockFace.ANALOG && face !== ClockFace.DIGITAL) return;
      const name = await desktop.pin_widget(app_id, { label: "Clock", props: { face } });
      if (!name) throw new Error("The desktop is full");
      notifications.notify(app_id, { title: "Clock added to the desktop", message: "It keeps alarms and timers ringing with this window closed." });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  $effect(() => win.on_back(() => {
    if (draft) draft = null;
    else if (adding_zone) adding_zone = false;
    else if (adding_timer && file.value.timers.length > 0) adding_timer = false;
    else return false;
    return true;
  }));

  const home = local_zone();
  const upcoming = $derived(file.ready ? next_alarm(file.value.alarms, ticker.now) : null);
  const running_timers = $derived(file.ready ? file.value.timers.filter((timer) => timer.end_at !== null).length : 0);
</script>

<div class="@container grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    <Segmented bind:value={tab.value} options={tabs} label="View" size="sm" />
    <span class="flex-1"></span>
    {#if tab.value === ClockTab.WORLD && !adding_zone}
      {#if can_pin}
        {@const pinned = widget_on_desktop()}
        <Button
          variant="quiet"
          size="sm"
          pressed={pinned !== undefined}
          title={pinned ? "A clock is on the desktop. Click to remove it." : "Show a clock on the desktop. It also rings alarms and timers with this window closed."}
          onclick={(event) => toggle_widget({ x: event.clientX, y: event.clientY })}
        >
          <Sticker />{pinned ? "On desktop" : "Add to desktop"}
        </Button>
      {/if}
      <Button variant="primary" size="sm" onclick={() => (adding_zone = true)}><Plus weight="bold" />Add city</Button>
    {:else if tab.value === ClockTab.ALARMS && !draft}
      <Button variant="primary" size="sm" onclick={new_alarm}><Plus weight="bold" />New alarm</Button>
    {:else if tab.value === ClockTab.TIMERS && !adding_timer && file.value.timers.length > 0}
      <Button variant="primary" size="sm" onclick={() => (adding_timer = true)}><Plus weight="bold" />New timer</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
    {:else if tab.value === ClockTab.WORLD}
      <WorldTab {file} now={ticker.now} bind:adding={adding_zone} />
    {:else if tab.value === ClockTab.ALARMS}
      <AlarmsTab {file} now={ticker.now} bind:draft onsave={ask_permission} ondelete={delete_alarm} />
    {:else if tab.value === ClockTab.TIMERS}
      <TimersTab {file} now={ticker.now} bind:adding={adding_timer} onstart={ask_permission} />
    {:else}
      <StopwatchTab {stopwatch} visible={win.is_visible} />
    {/if}
  </div>

  <StatusBar>
    {#if tab.value === ClockTab.WORLD}
      <span class="truncate">{home} · {format_utc_offset(zone_offset(ticker.now, home))}</span>
    {:else if tab.value === ClockTab.ALARMS}
      <span class="truncate">{upcoming ? `Next ${format_hm(upcoming.at)}, ${format_until(upcoming.at - ticker.now)}` : "No alarm set"}</span>
    {:else if tab.value === ClockTab.TIMERS}
      <span class="truncate">{running_timers ? `${running_timers} running` : "None running"}</span>
    {:else}
      <span class="truncate">{laps_of(stopwatch.value).length} laps</span>
    {/if}
    {#if tab.value === ClockTab.ALARMS || tab.value === ClockTab.TIMERS}
      <span class="ml-auto hidden truncate @md:inline">Rings while WebOS is open{can_pin ? ", with this window or the desktop clock" : ""}</span>
    {/if}
  </StatusBar>
</div>
