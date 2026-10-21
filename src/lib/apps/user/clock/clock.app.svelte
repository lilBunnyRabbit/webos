<script lang="ts">
  import kernel, { NotificationType, Platform, type DesktopItem, type DesktopService, type DialogsService, type NotificationsService, type SchedulerService } from "$lib/core/api";
  import { Button, Segmented, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    Alarm as AlarmIcon,
    Clock as ClockIcon,
    GlobeHemisphereWest as GlobeHemisphereWestIcon,
    Hourglass as HourglassIcon,
    Plus as PlusIcon,
    SquaresFour as SquaresFourIcon,
    Sticker as StickerIcon,
    Timer as TimerIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AllTab from "./all-tab.svelte";
  import AlarmsTab from "./alarms-tab.svelte";
  import {
    clock_alarms,
    clock_timers,
    ClockDataSchema,
    ClockFace,
    ClockTab,
    DATA_FILE,
    EMPTY_CLOCK,
    format_hm,
    format_until,
    landing_tab,
    laps_of,
    migrate_stopwatch,
    next_alarm,
    running_count,
    stopwatch_of,
    StopwatchSchema,
    type Alarm,
    type AlarmDraft,
    type StopwatchState,
  } from "./clock";
  import { attempt, delete_alarm as remove_alarm } from "./jobs";
  import { ring_while_alive } from "./ringer.svelte";
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
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  const file = storage.file(DATA_FILE, EMPTY_CLOCK, ClockDataSchema);
  const stopwatch = {
    get value(): StopwatchState {
      return stopwatch_of(file.value);
    },
    set value(next: StopwatchState) {
      file.value.stopwatch = next;
    },
  };
  const alarms = $derived(file.ready ? clock_alarms(scheduler.jobs, file.value) : []);
  const timers = $derived(file.ready ? clock_timers(scheduler.jobs, file.value) : []);
  const tab = storage.window<ClockTab>("tab", untrack(() => initial_tab ?? ClockTab.WORLD), z.enum(ClockTab));

  let landed = false;
  $effect(() => {
    if (landed || !file.ready) return;
    landed = true;
    untrack(() => {
      if (migrate_stopwatch(file.value, storage.get("stopwatch", StopwatchSchema))) storage.remove("stopwatch");
      const landing = landing_tab(initial_tab, running_count(timers, stopwatch_of(file.value)));
      if (landing) tab.value = landing;
    });
  });

  ring_while_alive(app_id);
  // Seconds everywhere else sit on the shared clock's second; a timer ends between them.
  const ticker = new Ticker(
    () => win.is_visible,
    () => (tab.value === ClockTab.TIMERS || tab.value === ClockTab.ALL ? 250 : 1000)
  );

  let adding_zone = $state(false);
  let adding_timer = $state(false);
  let draft = $state<AlarmDraft | null>(null);

  const can_pin = kernel.platform !== Platform.MOBILE;

  const tabs = [
    { value: ClockTab.ALL, label: "All", icon: SquaresFourIcon },
    { value: ClockTab.WORLD, label: "World", icon: GlobeHemisphereWestIcon },
    { value: ClockTab.ALARMS, label: "Alarms", icon: AlarmIcon },
    { value: ClockTab.TIMERS, label: "Timer", icon: HourglassIcon },
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
    draft = null;
    attempt("Couldn't delete the alarm", remove_alarm(alarm.job));
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
          { id: ClockFace.ANALOG, label: "Analog clock", icon: ClockIcon },
          { id: ClockFace.DIGITAL, label: "Digital clock", icon: TimerIcon },
        ],
        { anchor }
      );
      if (face !== ClockFace.ANALOG && face !== ClockFace.DIGITAL) return;
      const name = await desktop.pin_widget(app_id, { label: "Clock", props: { face } });
      if (!name) throw new Error("The desktop is full");
      notifications.notify(app_id, { title: "Clock added to the desktop" });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  $effect(() => win.on_back(() => {
    if (draft) draft = null;
    else if (adding_zone) adding_zone = false;
    else if (adding_timer && timers.length > 0) adding_timer = false;
    else return false;
    return true;
  }));

  const home = local_zone();
  const upcoming = $derived(file.ready ? next_alarm(alarms, ticker.now) : null);
  const running_timers = $derived(file.ready ? timers.filter((timer) => timer.end_at !== null).length : 0);
</script>

<div class="@container grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    <Segmented bind:value={tab.value} options={tabs} label="View" size="sm" class="hidden @2xl:inline-flex" />
    <Select bind:value={tab.value} options={tabs} size="sm" aria-label="View" class="w-32 @2xl:hidden" />
    <span class="flex-1"></span>
    {#if tab.value === ClockTab.WORLD && !adding_zone}
      {#if can_pin}
        {@const pinned = widget_on_desktop()}
        <Button
          variant="quiet"
          size="sm"
          pressed={pinned !== undefined}
          title={pinned ? "A clock is on the desktop. Click to remove it." : "Show a clock on the desktop"}
          onclick={(event) => toggle_widget({ x: event.clientX, y: event.clientY })}
        >
          <StickerIcon />{pinned ? "On desktop" : "Add to desktop"}
        </Button>
      {/if}
      <Button variant="primary" size="sm" onclick={() => (adding_zone = true)}><PlusIcon weight="bold" />Add city</Button>
    {:else if tab.value === ClockTab.ALARMS && !draft}
      <Button variant="primary" size="sm" onclick={new_alarm}><PlusIcon weight="bold" />New alarm</Button>
    {:else if tab.value === ClockTab.TIMERS && !adding_timer && timers.length > 0}
      <Button variant="primary" size="sm" onclick={() => (adding_timer = true)}><PlusIcon weight="bold" />New timer</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
    {:else if tab.value === ClockTab.ALL}
      <AllTab
        {file}
        {alarms}
        {timers}
        now={ticker.now}
        visible={win.is_visible}
        onopen={(next) => (tab.value = next)}
        onnewtimer={() => {
          tab.value = ClockTab.TIMERS;
          adding_timer = true;
        }}
        onnewalarm={() => {
          tab.value = ClockTab.ALARMS;
          new_alarm();
        }}
      />
    {:else if tab.value === ClockTab.WORLD}
      <WorldTab {file} now={ticker.now} bind:adding={adding_zone} />
    {:else if tab.value === ClockTab.ALARMS}
      <AlarmsTab {alarms} now={ticker.now} bind:draft onsave={ask_permission} ondelete={delete_alarm} />
    {:else if tab.value === ClockTab.TIMERS}
      <TimersTab {timers} now={ticker.now} bind:adding={adding_timer} onstart={ask_permission} />
    {:else}
      <StopwatchTab {stopwatch} visible={win.is_visible} />
    {/if}
  </div>

  <StatusBar>
    {#if tab.value === ClockTab.ALL}
      {@const running = file.ready ? running_count(timers, stopwatch.value) : 0}
      <span class="truncate">{running ? `${running} running` : "Nothing running"}</span>
    {:else if tab.value === ClockTab.WORLD}
      <span class="truncate">{home} · {format_utc_offset(zone_offset(ticker.now, home))}</span>
    {:else if tab.value === ClockTab.ALARMS}
      <span class="truncate">{upcoming ? `Next ${format_hm(upcoming.at)}, ${format_until(upcoming.at - ticker.now)}` : "No alarm set"}</span>
    {:else if tab.value === ClockTab.TIMERS}
      <span class="truncate">{running_timers ? `${running_timers} running` : "None running"}</span>
    {:else}
      <span class="truncate">{laps_of(stopwatch.value).length} laps</span>
    {/if}
    {#if tab.value === ClockTab.ALARMS || tab.value === ClockTab.TIMERS}
      <span class="ml-auto hidden truncate @md:inline">Rings while WebOS is open, with or without this window</span>
    {/if}
  </StatusBar>
</div>
