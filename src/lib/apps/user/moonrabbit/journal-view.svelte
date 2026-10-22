<script lang="ts">
  import kernel, { type DialogsService, type FilesService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Input, Segmented, Select, StatusBar, Textarea, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_date } from "$lib/core/utils";
  import { day_key } from "$lib/core/utils/date";
  import {
    ArrowsClockwise as ArrowsClockwiseIcon,
    BookOpenText as BookOpenTextIcon,
    CalendarBlank as CalendarIcon,
    CaretDown as CaretDownIcon,
    ChartLine as ChartLineIcon,
    Export as ExportIcon,
    GridNine as GridNineIcon,
    Tray as TrayIcon,
    Gear as GearIcon,
    Lock as LockIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Plus as PlusIcon,
    Sparkle as SparkleIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onMount, tick, untrack } from "svelte";
  import CalendarView from "./calendar-view.svelte";
  import EntryEditor from "./entry-editor.svelte";
  import EntryRow from "./entry-row.svelte";
  import ExportSheet from "./export-sheet.svelte";
  import { inbox_path } from "./inbox";
  import InsightsView from "./insights-view.svelte";
  import { days_written, matches, prompt_for, TEMPLATES, type Entry, type IndexEntry } from "./journal";
  import MoodDetails from "./mood-details.svelte";
  import MoodPicker from "./mood-picker.svelte";
  import { day_stats, on_this_day, type Details } from "./mood";
  import YearView from "./year-view.svelte";
  import type { JournalSession } from "./session.svelte";
  import SettingsSheet from "./settings-sheet.svelte";
  import type { JournalRef } from "./store";

  interface Props {
    session: JournalSession;
    journals: JournalRef[];
    recovered: boolean;
    idle_minutes: number;
    hidden_seconds: number;
    onlock: () => void;
    onswitch: (name: string) => void;
    onnew: () => void;
    onrename: () => void;
    ondelete: () => void;
    onerror: (title: string, reason: unknown) => void;
    ontitle: (date: string | null) => void;
  }

  let { session, journals, recovered, idle_minutes = $bindable(), hidden_seconds = $bindable(), onlock, onswitch, onnew, onrename, ondelete, onerror, ontitle }: Props = $props();

  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let today = $state(day_key());
  let quick_text = $state("");
  let quick_box = $state<HTMLTextAreaElement | null>(null);
  let skip = $state(0);
  let saved_flash = $state(false);
  let query = $state("");
  let open_entry = $state.raw<{ entry: Entry; fresh: boolean } | null>(null);
  let sheet = $state<"settings" | "export" | null>(null);
  let everything = $state.raw<Entry[] | null>(null);
  let show_recovered = $state(untrack(() => recovered));
  let quick_mood = $state<number | undefined>(undefined);
  let quick_details = $state.raw<Details>({});
  let quick_more = $state(false);

  const View = { ENTRIES: "entries", CALENDAR: "calendar", YEAR: "year", INSIGHTS: "insights" } as const;
  type View = (typeof View)[keyof typeof View];
  let view = $state<View>(View.ENTRIES);
  const views = [
    { value: View.ENTRIES, label: "Entries", icon: BookOpenTextIcon },
    { value: View.CALENDAR, label: "Calendar", icon: CalendarIcon },
    { value: View.YEAR, label: "Year", icon: GridNineIcon },
    { value: View.INSIGHTS, label: "Insights", icon: ChartLineIcon },
  ];

  const stats = $derived(day_stats(session.index));
  const earlier = $derived(on_this_day(session.index, today));

  const prompt = $derived(prompt_for(today, skip));
  const month_days = $derived(days_written(session.index, today.slice(0, 7)));

  onMount(() => {
    void tick().then(() => quick_box?.focus({ preventScroll: true }));
    const timer = setInterval(() => (today = day_key()), 60_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    files.revision(session.ref.path);
    untrack(() => session.load_index().catch((reason) => onerror("Couldn't read the journal", reason)));
  });

  $effect(() => {
    files.revision(inbox_path(session.ref));
    untrack(() => session.merge_inbox().catch((reason) => onerror("Couldn't add the entries written while locked", reason)));
  });

  $effect(() => {
    const index = session.index;
    if (!query.trim()) return;
    let stale = false;
    untrack(() =>
      session
        .all_entries()
        .then((all) => !stale && index === session.index && (everything = all))
        .catch((reason) => onerror("Couldn't search", reason))
    );
    return () => (stale = true);
  });

  const visible = $derived.by((): IndexEntry[] => {
    const q = query.trim();
    if (!q) return session.index;
    if (!everything) return [];
    const bodies = new Map(everything.map((entry) => [entry.id, entry]));
    return session.index.filter((meta) => {
      const entry = bodies.get(meta.id);
      return entry ? matches(entry, meta.tags, q) : false;
    });
  });

  const days = $derived.by(() => {
    const groups: { date: string; entries: IndexEntry[] }[] = [];
    for (const meta of visible) {
      const last = groups.at(-1);
      if (last?.date === meta.date) last.entries.push(meta);
      else groups.push({ date: meta.date, entries: [meta] });
    }
    return groups;
  });

  $effect(() => ontitle(open_entry ? open_entry.entry.date : null));

  $effect(() =>
    win.on_back(() => {
      if (sheet) {
        sheet = null;
        return true;
      }
      if (!open_entry) return false;
      open_entry = null;
      return true;
    })
  );

  function label_of(date: string): string {
    const [year, month, day] = date.split("-").map(Number);
    if (date === today) return "Today";
    return format_date(new Date(year, month - 1, day));
  }

  async function quick_save() {
    const text = quick_text.trim();
    if (!text && !quick_mood) return;
    try {
      await session.save({ ...session.new_entry(today, text), ...(quick_mood ? { mood: quick_mood } : {}), ...quick_details });
      quick_text = "";
      quick_mood = undefined;
      quick_details = {};
      quick_more = false;
      saved_flash = true;
      setTimeout(() => (saved_flash = false), 1500);
    } catch (reason) {
      onerror("Couldn't save the entry", reason);
    }
  }

  function on_quick_key(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void quick_save();
    }
  }

  function start(body: string, template?: string) {
    open_entry = { entry: session.new_entry(today, body, template), fresh: true };
  }

  async function new_menu(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        { id: "blank", label: "Blank entry", icon: PlusIcon },
        { separator: true },
        ...TEMPLATES.map((template) => ({ id: template.id, label: template.label, icon: BookOpenTextIcon })),
      ],
      { anchor: { x: box.left, y: box.bottom + 4 } }
    );
    if (choice === "blank") start("");
    else {
      const template = TEMPLATES.find((item) => item.id === choice);
      if (template) start(template.body, template.id);
    }
  }

  async function open(meta: IndexEntry) {
    view = View.ENTRIES;
    try {
      open_entry = { entry: await session.entry(meta.id), fresh: false };
    } catch (reason) {
      onerror("Couldn't open the entry", reason);
    }
  }

  async function on_delete(entry: Entry, fresh: boolean) {
    open_entry = null;
    try {
      if (fresh) await session.discard(entry);
      else await session.remove(entry.id);
    } catch (reason) {
      onerror("Couldn't delete the entry", reason);
    }
  }

  const options = $derived(journals.map((item) => ({ value: item.name, label: item.name })));
</script>

<div class="relative flex h-full min-h-0 flex-col">
  <Toolbar>
    <Segmented bind:value={view} options={views} label="View" size="sm" class="hidden @4xl:flex" />
    {#if journals.length > 1}
      <Select
        size="sm"
        class="w-auto max-w-40"
        aria-label="Journal"
        value={session.ref.name}
        options={[...options, { value: "\u0000new", label: "New journal…" }]}
        onchange={(event) => (event.currentTarget.value === "\u0000new" ? onnew() : onswitch(event.currentTarget.value))}
      />
    {:else}
      <span class="min-w-0 truncate px-1 text-ui font-medium">{session.ref.name}</span>
      <IconButton label="New journal" size="sm" onclick={onnew}><PlusIcon weight="bold" /></IconButton>
    {/if}
    <span class="flex-1"></span>
    {#if view === View.ENTRIES}
      <Input bind:value={query} spellcheck={false} size="sm" class="order-last w-full min-w-0 @md:order-none @md:w-48" placeholder="Search, or #tag" aria-label="Search entries">
        {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
        {#snippet trailing()}
          {#if query}<IconButton label="Clear search" size="sm" class="size-6" onclick={() => (query = "")}><XIcon weight="bold" /></IconButton>{/if}
        {/snippet}
      </Input>
    {/if}
    <Button size="sm" onclick={new_menu}><PlusIcon weight="bold" />New</Button>
    <IconButton label="Export" size="sm" onclick={() => (sheet = "export")}><ExportIcon weight="bold" /></IconButton>
    <IconButton label="Journal settings" size="sm" onclick={() => (sheet = "settings")}><GearIcon weight="bold" /></IconButton>
    <Button size="sm" onclick={onlock}><LockIcon weight="bold" />Lock</Button>
  </Toolbar>

  <div class={cn("flex justify-center border-b border-foreground/8 bg-background-light px-2 py-1.5 @4xl:hidden", open_entry && view === View.ENTRIES && "hidden @2xl:flex")}>
    <Segmented bind:value={view} options={views} label="View" size="sm" />
  </div>

  {#if view === View.CALENDAR}
    <div class="min-h-0 flex-1 overflow-auto"><CalendarView index={session.index} days={stats} {today} onopen={open} /></div>
  {:else if view === View.YEAR}
    <div class="min-h-0 flex-1 overflow-auto"><YearView index={session.index} days={stats} {today} onopen={open} /></div>
  {:else if view === View.INSIGHTS}
    <div class="min-h-0 flex-1 overflow-auto"><InsightsView days={stats} activities={session.activities} {today} /></div>
  {:else}
  <div class="grid min-h-0 flex-1 @2xl:grid-cols-[22rem_1fr]">
    <aside class={cn("flex min-h-0 flex-col border-foreground/8 @2xl:border-r", open_entry && "hidden @2xl:flex")}>
      <div class="min-h-0 flex-1 overflow-auto">
        {#if show_recovered}
          <div class="m-3 mb-0 flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-ui">
            <span class="min-w-0 flex-1">Opened with the recovery code. Set a new master phrase so you don't need it again.</span>
            <Button size="sm" onclick={() => ((sheet = "settings"), (show_recovered = false))}>Settings</Button>
          </div>
        {/if}

        {#if session.arrived || session.unreadable}
          <div class="m-3 mb-0 flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-ui" role="status">
            <TrayIcon class="mt-0.5 size-4 shrink-0 text-info" weight="fill" />
            <span class="min-w-0 flex-1">
              {#if session.arrived}{session.arrived} new {session.arrived === 1 ? "entry" : "entries"} since last unlock.{/if}
              {#if session.unreadable}{session.unreadable} {session.unreadable === 1 ? "item" : "items"} added while locked couldn't be read and stayed in the inbox.{/if}
            </span>
            <IconButton label="Dismiss" size="sm" onclick={() => ((session.arrived = 0), (session.unreadable = 0))}><XIcon weight="bold" /></IconButton>
          </div>
        {/if}

        <form
          class="grid gap-2 border-b border-foreground/8 p-3"
          onsubmit={(event) => {
            event.preventDefault();
            void quick_save();
          }}
        >
          <Textarea
            bind:element={quick_box}
            spellcheck={false}
            bind:value={quick_text}
            rows={2}
            placeholder={prompt}
            aria-label="Write today"
            title="Enter saves, Shift+Enter starts a new line"
            class="max-h-48 min-h-16 resize-none field-sizing-content text-base"
            onkeydown={on_quick_key}
          />
          <div class="flex flex-wrap items-center gap-1">
            <MoodPicker value={quick_mood} onchange={(mood) => (quick_mood = mood)} label="Today's mood" />
            <span class="flex-1"></span>
            <Button variant="quiet" size="sm" aria-expanded={quick_more} onclick={() => (quick_more = !quick_more)}>
              {quick_details.activities?.length ? `${quick_details.activities.length} ${quick_details.activities.length === 1 ? "activity" : "activities"}` : "Activities"}
              <CaretDownIcon weight="bold" class={cn("transition-transform", quick_more && "rotate-180")} />
            </Button>
          </div>
          {#if quick_more}
            <MoodDetails activities={session.activities} value={quick_details} onchange={(patch) => (quick_details = { ...quick_details, ...patch })} />
          {/if}
          <div class="flex flex-wrap items-center gap-1.5">
            <Button variant="quiet" size="sm" onclick={() => skip++} title="Show another prompt"><ArrowsClockwiseIcon weight="bold" />Skip prompt</Button>
            <Button variant="quiet" size="sm" onclick={() => start(`## ${prompt}\n\n`, "prompt")}><SparkleIcon weight="bold" />Answer</Button>
            <span class="min-w-0 flex-1 truncate text-right text-2xs text-foreground/80" aria-live="polite">{saved_flash ? "Saved" : ""}</span>
            <Button variant="primary" size="sm" type="submit" disabled={!quick_text.trim() && !quick_mood}>Save</Button>
          </div>
        </form>

        <p class="px-4 pt-3 pb-1 text-ui text-foreground/65">
          <span class="font-mono text-foreground tabular-nums">{month_days}</span>
          {month_days === 1 ? "day" : "days"} written this month
        </p>

        {#if earlier.length && !query.trim()}
          <section class="mx-2 mt-2 grid gap-1 rounded-lg bg-background-light p-1.5" aria-label="On this day">
            <h3 class="px-2 pt-1 text-2xs tracking-wide text-foreground/80 uppercase">On this day</h3>
            <ul class="grid gap-0.5">
              {#each earlier.slice(0, 4) as group (group.date)}
                {#each group.entries.slice(0, 2) as meta (meta.id)}
                  <li><EntryRow {meta} when={group.label} onopen={open} selected={open_entry?.entry.id === meta.id} /></li>
                {/each}
              {/each}
            </ul>
          </section>
        {/if}

        {#if query.trim() && !everything}
          <p class="px-4 py-3 text-ui text-foreground/65">Searching…</p>
        {:else if days.length === 0}
          <EmptyState
            icon={query.trim() ? MagnifyingGlassIcon : BookOpenTextIcon}
            title={query.trim() ? "No matches" : "No entries yet"}
            description={query.trim() ? "Search reads every entry, but only while unlocked." : "Write a line above, or just tap a face. That's an entry."}
            class="py-10"
          />
        {:else}
          <div class="grid gap-3 px-2 pt-3 pb-3">
            {#each days as day (day.date)}
              <section aria-label={label_of(day.date)}>
                <h3 class="px-2 pb-1 text-2xs tracking-wide text-foreground/80 uppercase">{label_of(day.date)}</h3>
                <ul class="grid gap-0.5">
                  {#each day.entries as meta (meta.id)}
                    <li><EntryRow {meta} onopen={open} selected={open_entry?.entry.id === meta.id} /></li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
        {/if}
      </div>
    </aside>

    <section class={cn("min-h-0", open_entry ? "flex flex-col" : "hidden @2xl:flex @2xl:flex-col")}>
      {#if open_entry}
        {#key open_entry.entry.id}
          <EntryEditor
            {session}
            entry={open_entry.entry}
            fresh={open_entry.fresh}
            onback={() => (open_entry = null)}
            onsaved={(entry) => {
              if (open_entry?.entry.id === entry.id) open_entry = { entry, fresh: false };
            }}
            ondelete={on_delete}
            {onerror}
          />
        {/key}
      {:else}
        <EmptyState icon={BookOpenTextIcon} title="Pick an entry" description="Or start one with New: blank, or a template." class="h-full" />
      {/if}
    </section>
  </div>
  {/if}

  <StatusBar>
    <span>{session.index.length} {session.index.length === 1 ? "entry" : "entries"}</span>
    <span>{idle_minutes ? `Locks after ${idle_minutes} min idle` : "Locks when you press Lock"}</span>
    <span class="hidden @md:inline">{session.ref.path}</span>
  </StatusBar>

  {#if sheet === "settings"}
    <SettingsSheet {session} bind:idle_minutes bind:hidden_seconds {onrename} {ondelete} onclose={() => (sheet = null)} />
  {:else if sheet === "export"}
    <ExportSheet {session} onclose={() => (sheet = null)} {onerror} />
  {/if}
</div>

