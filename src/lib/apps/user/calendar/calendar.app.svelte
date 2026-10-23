<script lang="ts">
  import kernel, { NotificationType, Platform, type AppsService, type DesktopItem, type DesktopService, type DialogsService, type NotificationsService, type SchedulerService } from "$lib/core/api";
  import { KANBAN_APP_ID } from "$lib/apps/user/kanban/data";
  import { day_minutes, format_hours, WORK_HOURS_APP_ID } from "$lib/apps/user/work-hours/data";
  import { Button, EmptyState, IconButton, Segmented, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import {
    CalendarBlank as CalendarBlankIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    ClockUser as ClockUserIcon,
    DotsThree as DotsThreeIcon,
    Kanban as KanbanIcon,
    ListBullets as ListBulletsIcon,
    Plus as PlusIcon,
    Rows as RowsIcon,
    SquaresFour as SquaresFourIcon,
    Sticker as StickerIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AgendaView from "./agenda-view.svelte";
  import {
    DaySchema,
    DEFAULT_SOURCES,
    draft_of,
    EMPTY_EVENTS,
    EVENTS_FILE,
    EventsFileSchema,
    event_from_draft,
    expand,
    format_day,
    group_by_day,
    month_grid,
    month_of,
    month_title,
    months_in,
    new_draft,
    range,
    skip_occurrence,
    SourcesSchema,
    span_title,
    step,
    time_of,
    View,
    week_days,
    type EventDraft,
    type Occurrence,
  } from "./calendar";
  import EventEditor from "./event-editor.svelte";
  import MonthView from "./month-view.svelte";
  import { attempt, cancel_reminder, sync_reminder } from "./jobs";
  import { next_reminder } from "./reminders";
  import { KanbanSource, WorkHoursSource } from "./store.svelte";
  import type { CalendarActions, DaySources } from "./view";
  import WeekView from "./week-view.svelte";
  import { day_key } from "$lib/core/utils/date";

  const { day: initial_day, view: initial_view }: { day?: string; view?: View } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  const file = storage.file(EVENTS_FILE, EMPTY_EVENTS, EventsFileSchema);
  const sources = storage.persisted("sources", DEFAULT_SOURCES, SourcesSchema);
  const view = storage.window<View>("view", untrack(() => initial_view ?? View.MONTH), z.enum(View));
  const anchor = storage.window<string>("anchor", untrack(() => initial_day ?? day_key(new Date())), DaySchema);
  let selected = $state(untrack(() => anchor.value));

  const ticker = new Ticker(() => win.is_visible, 30_000);
  const now = $derived(ticker.now);
  const today = $derived(day_key(new Date(now)));

  let width = $state(0);
  const week_count = $derived(width > 0 && width < 560 ? 3 : 7);

  const month = $derived(month_of(anchor.value));
  const visible_days = $derived.by(() => {
    if (view.value === View.MONTH) return month_grid(month).flat();
    if (view.value === View.WEEK) return week_days(anchor.value, week_count);
    return range(anchor.value, 30);
  });
  const first = $derived(visible_days[0]);
  const last = $derived(visible_days[visible_days.length - 1]);

  const occurrences = $derived(file.ready ? group_by_day(expand(file.value.events, first, last)) : new Map<string, Occurrence[]>());
  const work = new WorkHoursSource(() => (sources.value.work_hours ? months_in(first, last) : []));
  const kanban = new KanbanSource(() => sources.value.kanban);

  const day_sources: DaySources = {
    events: (day) => occurrences.get(day) ?? [],
    due: (day) => (sources.value.kanban ? kanban.on(day) : []),
    work: (day) => (sources.value.work_hours ? work.day(day) : undefined),
  };

  let draft = $state<EventDraft | null>(null);
  let occurrence_day = $state<string | null>(null);

  const actions: CalendarActions = {
    open_event(occurrence) {
      draft = draft_of($state.snapshot(occurrence.event));
      occurrence_day = occurrence.day;
    },
    create(day, minutes) {
      const next = new_draft(day, new Date(now));
      if (minutes !== undefined) {
        next.start = time_of(minutes);
        next.end = time_of(Math.min(minutes + 60, 24 * 60));
      }
      draft = next;
      occurrence_day = null;
    },
    show_day(day) {
      anchor.value = day;
      selected = day;
      view.value = View.WEEK;
    },
    open_card(id) {
      apps.launch(KANBAN_APP_ID, { card: id });
    },
    open_work() {
      apps.launch(WORK_HOURS_APP_ID);
    },
  };

  function save() {
    if (!draft) return;
    const previous = draft.id ? (file.value.events.find((event) => event.id === draft?.id) ?? null) : null;
    const event = event_from_draft($state.snapshot(draft), previous ? $state.snapshot(previous) : null);
    if (previous) file.value.events = file.value.events.map((entry) => (entry.id === event.id ? event : entry));
    else file.value.events = [...file.value.events, event];
    if (event.reminder !== null) void notifications.request_system();
    attempt("Couldn't set the reminder", sync_reminder(event));
    selected = event.day;
    draft = null;
  }

  async function remove(only: string | null) {
    if (!draft?.id) return;
    const id = draft.id;
    const target = file.value.events.find((event) => event.id === id);
    if (!target) return;
    if (only) {
      const skipped = skip_occurrence($state.snapshot(target), only);
      file.value.events = file.value.events.map((event) => (event.id === id ? skipped : event));
      attempt("Couldn't update the reminder", sync_reminder(skipped));
    } else {
      const what = target.repeat ? `every occurrence of “${target.title}”` : `“${target.title}”`;
      if (!(await win.confirm(`Delete ${what}?`, { confirm_label: "Delete", danger: true }))) return;
      file.value.events = file.value.events.filter((event) => event.id !== id);
      attempt("Couldn't remove the reminder", cancel_reminder(id));
    }
    draft = null;
  }

  function go(direction: number) {
    anchor.value = step(view.value, anchor.value, direction, week_count);
    selected = view.value === View.MONTH ? (month_of(selected) === month_of(anchor.value) ? selected : anchor.value) : anchor.value;
  }

  function go_today() {
    anchor.value = today;
    selected = today;
  }

  let date_input = $state<HTMLInputElement | null>(null);

  function jump(day: string) {
    if (!DaySchema.safeParse(day).success) return;
    anchor.value = day;
    selected = day;
  }

  const title = $derived(view.value === View.MONTH ? month_title(month) : span_title(visible_days));
  const short_title = $derived(format_day(view.value === View.MONTH ? `${month}-01` : visible_days[0], { month: "short", year: "numeric" }));

  const can_pin = kernel.platform !== Platform.MOBILE;

  function widget_on_desktop() {
    return desktop.items().find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id);
  }

  async function more(anchor_at: { x: number; y: number }) {
    const pinned = can_pin ? widget_on_desktop() : undefined;
    const choice = await dialogs.menu(
      [
        { id: "work", label: sources.value.work_hours ? "Hide worked hours" : "Show worked hours", icon: ClockUserIcon },
        { id: "kanban", label: sources.value.kanban ? "Hide Kanban due dates" : "Show Kanban due dates", icon: KanbanIcon },
        ...(can_pin ? [{ separator: true as const }, { id: "widget", label: pinned ? "Remove from desktop" : "Add to desktop", icon: StickerIcon }] : []),
      ],
      { anchor: anchor_at }
    );
    if (choice === "work") sources.value = { ...sources.value, work_hours: !sources.value.work_hours };
    else if (choice === "kanban") sources.value = { ...sources.value, kanban: !sources.value.kanban };
    else if (choice === "widget") await toggle_widget(pinned);
  }

  async function toggle_widget(existing: Extract<DesktopItem, { kind: "widget" }> | undefined) {
    try {
      if (existing) {
        await desktop.remove_item(existing.name);
        notifications.notify(app_id, { title: "Removed from the desktop", message: existing.label });
        return;
      }
      const name = await desktop.pin_widget(app_id, { label: "Today" });
      if (!name) throw new Error("The desktop is full");
      notifications.notify(app_id, { title: "Calendar added to the desktop", message: "It shows today's events and the next reminder." });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  $effect(() =>
    win.on_back(() => {
      if (!draft) return false;
      draft = null;
      return true;
    })
  );

  const range_events = $derived(
    view.value === View.MONTH ? [...occurrences.entries()].filter(([day]) => month_of(day) === month).reduce((sum, [, list]) => sum + list.length, 0) : [...occurrences.values()].reduce((sum, list) => sum + list.length, 0)
  );
  const range_worked = $derived(
    sources.value.work_hours ? visible_days.filter((day) => view.value !== View.MONTH || month_of(day) === month).reduce((sum, day) => sum + day_minutes(work.day(day)), 0) : 0
  );
  const upcoming = $derived(next_reminder(scheduler.list(app_id), now));

  const views = [
    { value: View.MONTH, label: "Month", icon: SquaresFourIcon },
    { value: View.WEEK, label: "Week", icon: RowsIcon },
    { value: View.AGENDA, label: "Agenda", icon: ListBulletsIcon },
  ];
</script>

<div class="@container grid h-full grid-rows-[auto_minmax(0,1fr)_auto]" bind:clientWidth={width}>
  {#if draft}
    <Toolbar>
      <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{draft.id ? draft.title || "Event" : "New event"}</span>
    </Toolbar>
  {:else}
    <Toolbar>
      <Button variant="quiet" size="sm" onclick={go_today}>Today</Button>
      <IconButton label="Previous" size="sm" onclick={() => go(-1)}><CaretLeftIcon weight="bold" /></IconButton>
      <IconButton label="Next" size="sm" onclick={() => go(1)}><CaretRightIcon weight="bold" /></IconButton>
      <span class="relative min-w-0 flex-1">
        <button
          type="button"
          class="max-w-full truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold transition-[background-color,box-shadow,color] hover:bg-background-lighter hover:text-foreground hover:shadow-control active:shadow-pressed focus-visible:outline-2 focus-visible:outline-cottontail"
          title="Jump to a date"
          onclick={() => date_input?.showPicker()}
        >
          <span class="@md:hidden">{short_title}</span><span class="hidden @md:inline">{title}</span>
        </button>
        <input
          bind:this={date_input}
          type="date"
          class="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
          tabindex="-1"
          aria-hidden="true"
          value={selected}
          onchange={(event) => jump(event.currentTarget.value)}
        />
      </span>
      <Segmented bind:value={view.value} options={views} label="View" size="sm" class="hidden @2xl:inline-flex" />
      <Select bind:value={view.value} options={views} size="sm" aria-label="View" class="w-24 @2xl:hidden" />
      <IconButton label="More" size="sm" onclick={(event) => more({ x: event.clientX, y: event.clientY })}><DotsThreeIcon weight="bold" /></IconButton>
      <Button variant="primary" size="sm" aria-label="New event" onclick={() => actions.create(view.value === View.AGENDA ? today : selected)}>
        <PlusIcon weight="bold" /><span class="hidden @md:inline">New event</span>
      </Button>
    </Toolbar>
  {/if}

  <div class="min-h-0">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading" /></div>
    {:else if draft}
      <EventEditor bind:draft {occurrence_day} onsave={save} ondelete={remove} oncancel={() => (draft = null)} />
    {:else if file.error}
      <EmptyState icon={CalendarBlankIcon} tone="error" title="Couldn't read your events" description={file.error} />
    {:else if view.value === View.MONTH}
      <MonthView {month} {today} bind:selected sources={day_sources} {actions} />
    {:else if view.value === View.WEEK}
      <WeekView days={visible_days} {today} {now} sources={day_sources} {actions} />
    {:else}
      <AgendaView days={visible_days} {today} sources={day_sources} {actions} />
    {/if}
  </div>

  <StatusBar>
    <span class="truncate">
      {range_events}
      {range_events === 1 ? "event" : "events"}{#if range_worked > 0}{` · worked ${format_hours(range_worked)} h`}{/if}
    </span>
    {#if upcoming}
      {@const at = new Date(upcoming.at)}
      <span class="ml-auto hidden truncate @md:inline">
        Next reminder {format_day(day_key(at), { month: "short", day: "numeric" })}
        {time_of(at.getHours() * 60 + at.getMinutes())} · {upcoming.job.title}
      </span>
    {/if}
  </StatusBar>
</div>
