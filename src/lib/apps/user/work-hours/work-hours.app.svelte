<script lang="ts">
  import kernel, { NotificationType, Platform, type DesktopItem, type DesktopService, type NotificationsService } from "$lib/core/api";
  import { Button, IconButton, Input, Spinner, StatusBar, Textarea, Toolbar } from "$lib/core/components/ui";
  import { get_app_context, type JsonFile } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { print_html } from "$lib/core/utils/print";
  import { format_time } from "$lib/core/games";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { CaretLeft, CaretRight, PencilSimple, Play, Printer, Sticker, Stop, Target, Trash } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import {
    calendar_weeks,
    clock_time,
    date_of,
    day_key,
    day_minutes,
    DayKeySchema,
    entry_minutes,
    format_hours,
    is_weekend,
    minutes_of,
    month_key,
    month_minutes,
    month_of,
    MonthKeySchema,
    new_entry_id,
    parse_target,
    remove_entry,
    running_minutes,
    set_note,
    set_target,
    shift_month,
    sorted_entries,
    time_of,
    update_entry,
    add_entry,
    week_minutes,
    worked_days,
    type Entry,
    type MonthFile,
  } from "./data";
  import EntryForm, { type EntryDraft } from "./entry-form.svelte";
  import { month_label, month_report_html } from "./report";
  import { clock_in, clock_out, edit_month, open_month, open_state, set_running_description } from "./store";
  import { TextDraft } from "./draft.svelte";

  const { app_id, window: win, storage } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));

  const ticker = new Ticker(
    () => win.is_visible,
    () => (running ? 1000 : 30_000)
  );
  const now = $derived(new Date(ticker.now));
  const today = $derived(day_key(now));

  const month = storage.window("month", month_key(new Date()), MonthKeySchema);
  const selected = storage.window("day", day_key(new Date()), DayKeySchema);

  const state_file = open_state();
  $effect(() => () => state_file.release());

  let month_file = $state.raw<JsonFile<MonthFile> | null>(null);
  $effect(() => {
    const handle = open_month(month.value);
    month_file = handle;
    return () => handle.release();
  });

  const file = $derived(month_file?.ready ? month_file.value : null);
  const running = $derived(state_file.ready ? state_file.value.running : null);

  const weeks = $derived(calendar_weeks(month.value));
  const week_totals = $derived(file ? week_minutes(file) : []);
  const running_today = $derived(running && day_key(new Date(running.start)) === today ? running_minutes(running, now) : 0);
  const total = $derived(file ? month_minutes(file) : 0);
  const live_total = $derived(total + (month_of(today) === month.value ? running_today : 0));
  const target_minutes = $derived(file?.target_hours != null ? file.target_hours * 60 : null);
  const day = $derived(file?.days[selected.value]);
  const entries = $derived(sorted_entries(day));

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function report(error: unknown, title: string) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: String(error) });
  }

  function go(to: string) {
    month.value = to;
    const current = month_of(today) === to;
    selected.value = current ? today : `${to}-01`;
  }

  function select(day: string) {
    selected.value = day;
    if (month_of(day) !== month.value) month.value = month_of(day);
  }

  async function toggle_clock() {
    if (!state_file.ready) return;
    try {
      if (!running) return await clock_in();
      description.flush();
      const booked = await clock_out();
      const minutes = booked.reduce((sum, segment) => sum + entry_minutes(segment), 0);
      notifications.notify(app_id, {
        type: NotificationType.INFO,
        title: minutes ? `Booked ${format_hours(minutes)}` : "Under a minute, nothing booked",
        message: booked.length > 1 ? `Split across ${booked.length} days at midnight.` : undefined,
      });
    } catch (error) {
      report(error, "Couldn't book the session");
    }
  }

  const description = new TextDraft((_, text) => set_running_description(text).catch((error) => report(error, "Couldn't save")));
  const note = new TextDraft((day_value, text) => write(day_value, (file) => set_note(file, day_value, text)));
  $effect(() => () => {
    description.flush();
    note.flush();
  });

  async function write(day_value: string, change: (file: MonthFile) => MonthFile) {
    try {
      await edit_month(month_of(day_value), change);
    } catch (error) {
      report(error, "Couldn't save");
    }
  }

  let add_key = $state(0);
  let editing = $state<string | null>(null);

  const add_initial = $derived.by((): EntryDraft => {
    const last = entries.at(-1);
    if (!last) return { day: selected.value, start: "09:00", end: "17:00", description: "" };
    const start = Math.min(minutes_of(last.end), 23 * 60);
    return { day: selected.value, start: time_of(start), end: time_of(Math.min(start + 60, 24 * 60 - 1)), description: "" };
  });

  async function add(draft: EntryDraft) {
    await write(draft.day, (file) => add_entry(file, draft.day, { id: new_entry_id(), start: draft.start, end: draft.end, description: draft.description }));
    add_key++;
    select(draft.day);
  }

  async function save(entry: Entry, draft: EntryDraft) {
    const next: Entry = { id: entry.id, start: draft.start, end: draft.end, description: draft.description };
    if (draft.day === selected.value) await write(draft.day, (file) => update_entry(file, draft.day, next));
    else {
      const from = selected.value;
      await write(draft.day, (file) => add_entry(file, draft.day, next));
      await write(from, (file) => remove_entry(file, from, entry.id));
    }
    editing = null;
  }

  async function remove(entry: Entry) {
    const ok = await win.confirm(`Delete ${entry.start}–${entry.end}?`, {
      detail: entry.description ? `“${entry.description}” is removed from this day.` : "The entry is removed from this day.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!ok) return;
    const from = selected.value;
    await write(from, (file) => remove_entry(file, from, entry.id));
  }

  async function edit_target() {
    if (!file) return;
    const current = file.target_hours;
    const target_month = month.value;
    const last = storage.get("last_target", z.number());
    const answer = await win.prompt(`Target for ${month_label(month.value)}`, {
      detail: "Hours you mean to work this month. Leave empty for no target.",
      initial: String(current ?? last ?? ""),
      placeholder: "160",
      confirm_label: "Set",
      validate: (value) => (parse_target(value) === undefined ? "Enter a number of hours" : null),
    });
    if (answer === null) return;
    const hours = parse_target(answer) ?? null;
    await write(`${target_month}-01`, (next) => set_target(next, hours));
    if (hours !== null) storage.set("last_target", hours);
  }

  async function print_report() {
    if (!file) return;
    try {
      await print_html(month_report_html(file, { generated: new Date() }), { title: `Time sheet ${month.value}` });
    } catch (error) {
      report(error, "Couldn't print the report");
    }
  }

  const can_pin = kernel.platform !== Platform.MOBILE;
  const widget = $derived(
    desktop.items().find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id)
  );

  async function toggle_widget() {
    try {
      if (widget) await desktop.remove_item(widget.name);
      else await desktop.pin_widget(app_id, { label: "Work Hours", size: { w: 2, h: 2 } });
    } catch (error) {
      report(error, "Couldn't change the desktop");
    }
  }

  const long_date = (value: string) => date_of(value).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const progress = $derived(target_minutes ? Math.min(1, live_total / target_minutes) : 0);
</script>

<div class="@container grid h-full grid-rows-[auto_auto_1fr_auto]">
  <Toolbar>
    <IconButton label="Previous month" size="sm" onclick={() => go(shift_month(month.value, -1))}><CaretLeft weight="bold" /></IconButton>
    <h2 class="min-w-0 truncate px-1 text-center text-ui font-medium @md:w-32">{month_label(month.value)}</h2>
    <IconButton label="Next month" size="sm" onclick={() => go(shift_month(month.value, 1))}><CaretRight weight="bold" /></IconButton>
    {#if month.value !== month_of(today) || selected.value !== today}
      <Button variant="quiet" size="sm" onclick={() => go(month_of(today))}>Today</Button>
    {/if}
    <span class="flex-1"></span>
    <IconButton label="Monthly target" size="sm" disabled={!file} onclick={edit_target}><Target /></IconButton>
    <IconButton label="Print monthly report" size="sm" disabled={!file} onclick={print_report}><Printer /></IconButton>
    {#if can_pin}
      <IconButton label={widget ? "Remove from desktop" : "Add to desktop"} size="sm" pressed={widget !== undefined} onclick={toggle_widget}><Sticker /></IconButton>
    {/if}
    <Button variant={running ? "secondary" : "primary"} size="sm" disabled={!state_file.ready} onclick={toggle_clock}>
      {#if running}<Stop weight="fill" />Clock out{:else}<Play weight="fill" />Clock in{/if}
    </Button>
  </Toolbar>

  {#if running}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-foreground/8 bg-primary/8 px-3 py-2">
      <span class="flex items-center gap-2 text-ui">
        <span class="size-2 animate-pulse rounded-full bg-primary"></span>
        Clocked in at <span class="font-mono">{clock_time(new Date(running.start))}</span>
      </span>
      <span class="font-mono text-ui font-medium tabular-nums text-primary">{format_time(now.getTime() - new Date(running.start).getTime())}</span>
      <Input
        size="sm"
        class="min-w-0 flex-1 basis-60"
        value={description.value(running.start, running.description)}
        oninput={(event) => running && description.edit(running.start, event.currentTarget.value)}
        placeholder="What are you working on?"
        aria-label="What are you working on?"
      />
    </div>
  {:else}
    <div></div>
  {/if}

  <div class="min-h-0 overflow-auto">
    {#if !file}
      <div class="grid h-full place-items-center"><Spinner label="Reading your hours" /></div>
    {:else}
      <div class="mx-auto grid max-w-6xl gap-4 p-3 @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:p-4">
        <section class="grid min-w-0 content-start gap-3">
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg bg-background-light px-3 py-2">
              <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Month</p>
              <p class="font-mono text-lg font-medium tabular-nums">{format_hours(live_total)}</p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-background-light px-3 py-2 text-left transition-colors hover:bg-foreground/8"
              onclick={edit_target}
              title="Set the monthly target"
            >
              <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Target</p>
              {#if target_minutes !== null}
                <p class="font-mono text-lg font-medium tabular-nums">
                  {format_hours(target_minutes)}<span class="ml-1.5 text-2xs text-foreground/65">{Math.round(progress * 100)}%</span>
                </p>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
                  <div class={cn("h-full rounded-full", progress >= 1 ? "bg-success" : "bg-primary")} style:width="{progress * 100}%"></div>
                </div>
              {:else}
                <p class="text-ui text-foreground/65 @md:py-1">Set one</p>
              {/if}
            </button>
            <div class="rounded-lg bg-background-light px-3 py-2">
              <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Today</p>
              <p class="font-mono text-lg font-medium tabular-nums">
                {format_hours(day_minutes(month_of(today) === month.value ? file.days[today] : undefined) + running_today)}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-[repeat(7,minmax(0,1fr))_auto] gap-1" role="grid" aria-label="{month_label(month.value)}, hours per day">
            <div role="row" class="contents">
              {#each WEEKDAYS as name (name)}
                <div role="columnheader" class="pb-0.5 text-center text-2xs font-medium tracking-wide text-foreground/65 uppercase">{name}</div>
              {/each}
              <div role="columnheader" class="pb-0.5 text-center text-2xs font-medium tracking-wide text-foreground/65 uppercase">Week</div>
            </div>
            {#each weeks as week, index (week.week)}
              <div role="row" class="contents">
                {#each week.days as cell, column (column)}
                  {#if cell}
                    {@const minutes = day_minutes(file.days[cell]) + (cell === today ? running_today : 0)}
                    {@const has_note = !!file.days[cell]?.note.trim()}
                    <button
                      type="button"
                      role="gridcell"
                      aria-selected={cell === selected.value}
                      aria-label="{long_date(cell)}, {minutes ? format_hours(minutes) : 'no hours'}{has_note ? ', has a note' : ''}"
                      class={cn(
                        "relative flex min-h-12 min-w-0 flex-col justify-between rounded-md p-1.5 text-left transition-colors @md:min-h-16",
                        "hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                        is_weekend(cell) ? "bg-foreground/3" : "bg-background-light",
                        cell === selected.value && "bg-primary/14 hover:bg-primary/18"
                      )}
                      onclick={() => select(cell)}
                    >
                      <span class="flex items-center gap-1">
                        <span
                          class={cn(
                            "grid size-5 place-items-center rounded-full font-mono text-2xs tabular-nums",
                            cell === today ? "bg-primary font-medium text-background" : is_weekend(cell) ? "text-foreground/55" : "text-foreground/80"
                          )}>{Number(cell.slice(8))}</span
                        >
                        {#if has_note}<span class="size-1.5 rounded-full bg-secondary" aria-hidden="true"></span>{/if}
                      </span>
                      {#if minutes}
                        <span class="self-end font-mono text-2xs font-medium tabular-nums @md:text-ui">{format_hours(minutes)}</span>
                      {/if}
                    </button>
                  {:else}
                    <div role="gridcell" aria-hidden="true"></div>
                  {/if}
                {/each}
                <div role="gridcell" class="flex min-w-11 flex-col items-end justify-between px-1 py-1.5 @md:min-w-14">
                  <span class="font-mono text-2xs text-foreground/55">W{week.week}</span>
                  {#if week_totals[index]?.minutes}
                    <span class="font-mono text-2xs font-medium tabular-nums text-foreground/80 @md:text-ui">{format_hours(week_totals[index].minutes)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>

        <aside class="grid min-w-0 content-start gap-3 rounded-lg bg-background-light p-3">
          <header class="flex items-baseline justify-between gap-2">
            <h3 class="truncate text-sm font-medium">{long_date(selected.value)}</h3>
            <span class="font-mono text-ui tabular-nums text-foreground/80">{format_hours(day_minutes(day) + (selected.value === today ? running_today : 0))}</span>
          </header>

          {#if entries.length}
            <ul class="grid gap-1">
              {#each entries as entry (entry.id)}
                <li class="rounded-md">
                  {#if editing === entry.id}
                    <div class="rounded-md bg-background p-2">
                      <EntryForm
                        initial={{ day: selected.value, start: entry.start, end: entry.end, description: entry.description }}
                        submit_label="Save"
                        onsubmit={(draft) => save(entry, draft)}
                        oncancel={() => (editing = null)}
                      />
                    </div>
                  {:else}
                    <div class="group flex min-h-8 items-center gap-2 rounded-md px-1.5 hover:bg-foreground/6">
                      <span class="font-mono text-2xs whitespace-nowrap tabular-nums">{entry.start}–{entry.end}</span>
                      <span class={cn("min-w-0 flex-1 truncate text-ui", !entry.description && "text-foreground/45")}>{entry.description || "No description"}</span>
                      <span class="font-mono text-2xs tabular-nums text-foreground/65">{format_hours(entry_minutes(entry))}</span>
                      <span class="flex">
                        <IconButton label="Edit entry" size="sm" onclick={() => (editing = entry.id)}><PencilSimple /></IconButton>
                        <IconButton label="Delete entry" size="sm" onclick={() => remove(entry)}><Trash /></IconButton>
                      </span>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-ui text-foreground/65">
              {selected.value === today && running ? "The running session is booked when you clock out." : "No time booked. Clock in, or add an entry below."}
            </p>
          {/if}

          <div class="grid gap-2 border-t border-foreground/8 pt-3">
            <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Add an entry</p>
            {#key `${selected.value}:${add_key}:${entries.length}`}
              <EntryForm initial={untrack(() => add_initial)} submit_label="Add" onsubmit={add} />
            {/key}
          </div>

          <label class="grid gap-1.5 border-t border-foreground/8 pt-3">
            <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Note</span>
            <Textarea
              size="sm"
              class="min-h-20"
              value={note.value(selected.value, day?.note ?? "")}
              oninput={(event) => note.edit(selected.value, event.currentTarget.value)}
              placeholder="Anything worth remembering about this day"
            />
          </label>
        </aside>
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{format_hours(live_total)}{target_minutes !== null ? ` / ${format_hours(target_minutes)}` : ""}</span>
    {#if file}<span>{worked_days(file)} {worked_days(file) === 1 ? "day" : "days"}</span>{/if}
    {#if file && worked_days(file)}<span class="hidden @md:inline">⌀ {format_hours(total / worked_days(file))}/day</span>{/if}
    {#if running}<span class="text-primary">running</span>{/if}
  </StatusBar>
</div>
