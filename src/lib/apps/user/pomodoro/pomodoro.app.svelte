<script lang="ts">
  import kernel, { JobKind, NotificationType, Platform, type DesktopService, type NotificationsService } from "$lib/core/api";
  import { Button, IconButton, Input, Section, Segmented, SettingRow, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { ArrowCounterClockwise, ChartBar, Gear, Pause, Play, SkipForward, SpeakerHigh, Sticker, Timer } from "phosphor-svelte";
  import { z } from "zod";
  import { ended_text, format_clock, is_break, Phase, PHASE_LABELS, PHASES, progress, remaining_ms, Status, type Settings } from "./pomodoro";
  import Ring from "./ring.svelte";
  import { day_stats, format_minutes, last_days, streak, totals } from "./stats";
  import { acquire_timer } from "./timer.svelte";
  import { day_key } from "$lib/core/utils/date";

  const { window: win, storage, app_id } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));

  const { timer, release } = acquire_timer();
  $effect(() => release);

  const View = { TIMER: "timer", STATS: "stats", SETTINGS: "settings" } as const;
  type View = (typeof View)[keyof typeof View];
  const view = storage.window<View>("view", View.TIMER, z.enum([View.TIMER, View.STATS, View.SETTINGS]));
  const views = [
    { value: View.TIMER, label: "Timer", icon: Timer },
    { value: View.STATS, label: "Stats", icon: ChartBar },
    { value: View.SETTINGS, label: "Settings", icon: Gear },
  ];

  const run = $derived(timer.run);
  const settings = $derived(timer.settings);
  const running = $derived(timer.ready && run.status === Status.RUNNING);
  const ticker = new Ticker(
    () => win.is_visible,
    () => (running ? 1000 : 60_000)
  );
  const now = $derived(ticker.now);

  const remaining = $derived(remaining_ms(run, settings, now));
  const value = $derived(progress(run, settings, now));
  const rest = $derived(is_break(run.phase));

  const title = $derived.by(() => {
    if (!timer.ready || run.status === Status.IDLE) return null;
    if (run.status === Status.PAUSED) return `${format_time(remaining)} · Paused`;
    // Hidden, the title doesn't tick, but the end time stays true for the taskbar tooltip.
    return win.is_visible ? `${format_time(remaining)} · ${PHASE_LABELS[run.phase]}` : `${PHASE_LABELS[run.phase]} until ${format_clock(run.ends_at ?? 0)}`;
  });
  $effect(() => win.set_title(title));

  const day = $derived(day_key(new Date(now)));
  const today = $derived(new Date(`${day}T12:00`));
  const stats = $derived(timer.stats.value);
  const today_stats = $derived(day_stats(stats, day));
  const days = $derived(last_days(stats, today));
  const day_streak = $derived(streak(stats, today));
  const all_time = $derived(totals(stats));
  const max_ms = $derived(Math.max(...days.map((day) => day.ms), 1));
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const phase_options = PHASES.map((phase) => ({ value: phase, label: PHASE_LABELS[phase] }));

  // The radio is already checked when the confirm is cancelled; re-rendering puts it back on the real phase.
  let phase_picker = $state(0);

  async function choose(phase: Phase) {
    if (phase === run.phase) return;
    if (run.status !== Status.IDLE) {
      const stop = await win.confirm(`Stop this ${PHASE_LABELS[run.phase].toLowerCase()}?`, {
        detail: `${format_time(remaining)} left. ${PHASE_LABELS[phase]} waits for Start.`,
        confirm_label: "Stop",
      });
      if (!stop) {
        phase_picker++;
        return;
      }
    }
    void timer.choose(phase);
  }

  function toggle() {
    void (running ? timer.pause() : timer.start());
  }

  const can_pin = kernel.platform !== Platform.MOBILE;
  const widget = $derived(desktop.items().find((item) => item.kind === "widget" && item.app_id === app_id));

  async function toggle_widget() {
    try {
      if (widget) {
        await desktop.remove_item(widget.name);
        return;
      }
      await desktop.pin_widget(app_id, { label: "Pomodoro" });
      notifications.notify(app_id, { title: "Timer added to the desktop", message: "Start and pause it right there." });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  type NumberKey = "focus_min" | "short_min" | "long_min" | "long_every";
  const LIMITS: Record<NumberKey, [number, number]> = { focus_min: [1, 180], short_min: [1, 60], long_min: [1, 120], long_every: [2, 12] };

  function set_number(key: NumberKey, input: unknown) {
    const number = Number(input);
    if (input === null || input === "" || !Number.isFinite(number)) return;
    const [min, max] = LIMITS[key];
    timer.file.value.settings[key] = Math.min(max, Math.max(min, Math.round(number)));
  }

  const number_rows: { key: NumberKey; label: string; description: string }[] = [
    { key: "focus_min", label: "Focus", description: "Minutes of work per session." },
    { key: "short_min", label: "Short break", description: "Minutes between focus sessions." },
    { key: "long_min", label: "Long break", description: "Minutes after a full set." },
    { key: "long_every", label: "Long break after", description: "Focus sessions in a set." },
  ];

  const switch_rows: { key: keyof Pick<Settings, "auto_breaks" | "auto_focus">; label: string; description: string }[] = [
    { key: "auto_breaks", label: "Start breaks automatically", description: "A break begins as soon as focus ends." },
    { key: "auto_focus", label: "Start focus automatically", description: "The next focus begins as soon as a break ends." },
  ];

  let permission = $state<NotificationPermission | "unsupported">("Notification" in window ? Notification.permission : "unsupported");

  async function allow_notifications() {
    await notifications.request_system();
    permission = Notification.permission;
  }

  async function play_chime() {
    (await import("$lib/core/api/services/scheduler/chime")).play_chime(JobKind.PHASE);
  }

  async function clear_stats() {
    const sure = await win.confirm("Clear all statistics?", {
      detail: `${all_time.sessions} focus sessions are removed. Your settings and the running timer stay.`,
      confirm_label: "Clear",
      danger: true,
    });
    if (sure) timer.clear_stats();
  }
</script>

<div class="@container grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented bind:value={view.value} options={views} label="View" size="sm" />
    <span class="flex-1"></span>
    {#if can_pin}
      <Button
        variant="quiet"
        size="sm"
        pressed={widget !== undefined}
        title={widget ? "The timer is on the desktop. Click to remove it." : "Show a small timer on the desktop, with start and pause."}
        onclick={toggle_widget}
      >
        <Sticker /><span class="hidden @sm:inline">{widget ? "On desktop" : "Add to desktop"}</span>
      </Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !timer.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading the timer" /></div>
    {:else if view.value === View.TIMER}
      <div class="flex h-full min-h-80 flex-col items-center gap-4 p-4">
        {#key phase_picker}
          <Segmented bind:value={() => run.phase, (phase) => void choose(phase)} options={phase_options} label="Phase" size="sm" />
        {/key}

        <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
          <Ring value={value} {rest} class="size-[min(100cqmin,26rem)] [container-type:size]">
            <div class="flex flex-col items-center gap-[2cqi] text-center">
              <span class={cn("text-[max(0.6875rem,6cqi)] font-medium tracking-wide uppercase", rest ? "text-success" : "text-primary")}>
                {run.status === Status.PAUSED ? "Paused" : PHASE_LABELS[run.phase]}
              </span>
              <span class="font-mono text-[20cqi] leading-none font-medium tabular-nums" role="timer" aria-label="Time left">{format_time(remaining)}</span>
              <span class="flex gap-[2cqi]" aria-label="Focus {Math.min(run.round + (run.phase === Phase.FOCUS ? 1 : 0), settings.long_every)} of {settings.long_every}">
                {#each { length: settings.long_every }, index}
                  <span class={cn("size-[max(0.375rem,2.5cqi)] rounded-full", index < run.round ? "bg-primary" : index === run.round && run.phase === Phase.FOCUS ? "bg-primary/45" : "bg-foreground/15")}></span>
                {/each}
              </span>
            </div>
          </Ring>
        </div>

        {#if timer.ended}
          <p class="text-ui text-foreground/65" role="status">{ended_text(timer.ended)}</p>
        {/if}

        <Input bind:value={() => timer.task, (task) => (timer.task = task ?? "")} class="max-w-xs text-center" placeholder="What are you focusing on?" aria-label="Task" maxlength={120} />

        <div class="flex items-center gap-3">
          <IconButton label="Reset" size="md" onclick={() => void timer.reset()} disabled={run.status === Status.IDLE}><ArrowCounterClockwise weight="bold" /></IconButton>
          <Button variant="primary" size="lg" class="min-w-32" onclick={toggle}>
            {#if running}<Pause weight="fill" /> Pause{:else if run.status === Status.PAUSED}<Play weight="fill" /> Resume{:else}<Play weight="fill" /> Start{/if}
          </Button>
          <IconButton label={`Skip to ${PHASE_LABELS[run.phase === Phase.FOCUS ? (run.round + 1 >= settings.long_every ? Phase.LONG : Phase.SHORT) : Phase.FOCUS].toLowerCase()}`} size="md" onclick={() => void timer.skip()}>
            <SkipForward weight="bold" />
          </IconButton>
        </div>
      </div>
    {:else if view.value === View.STATS}
      <div class="mx-auto flex max-w-2xl flex-col gap-6 p-4 @md:p-6">
        <div class="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          {#each [{ label: "Today", value: String(today_stats.sessions), detail: today_stats.sessions === 1 ? "session" : "sessions" }, { label: "Focused today", value: format_minutes(today_stats.ms), detail: "" }, { label: "Streak", value: String(day_streak), detail: day_streak === 1 ? "day" : "days" }, { label: "All time", value: String(all_time.sessions), detail: format_minutes(all_time.ms) }] as tile (tile.label)}
            <div class="flex flex-col gap-1 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
              <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{tile.label}</span>
              <span class="truncate font-mono text-lg font-medium tabular-nums">{tile.value} <span class="text-2xs font-normal text-foreground/65">{tile.detail}</span></span>
            </div>
          {/each}
        </div>

        <Section title="Last 7 days" description="Minutes of finished focus per day.">
          <div class="grid h-52 grid-cols-7 items-end gap-2 px-3 pt-4 pb-3" role="img" aria-label={days.map((day) => `${WEEKDAYS[day.date.getDay()]} ${Math.round(day.ms / 60000)} minutes`).join(", ")}>
            {#each days as day, index (day.day)}
              {@const is_today = index === days.length - 1}
              <div class="flex h-full min-w-0 flex-col items-center gap-1">
                <div class="flex min-h-0 w-full flex-1 items-end justify-center pt-5">
                  <div class={cn("relative w-full max-w-10 rounded-t-md", day.ms ? (is_today ? "bg-primary" : "bg-primary/55") : "bg-foreground/8")} style:height="{day.ms ? Math.max(4, (day.ms / max_ms) * 100) : 2}%">
                    {#if day.ms}<span class="absolute inset-x-0 -top-5 text-center font-mono text-2xs text-foreground/65 tabular-nums">{Math.round(day.ms / 60000)}</span>{/if}
                  </div>
                </div>
                <span class={cn("text-2xs", is_today ? "font-semibold text-foreground" : "text-foreground/65")}>{WEEKDAYS[day.date.getDay()]}</span>
              </div>
            {/each}
          </div>
        </Section>
      </div>
    {:else}
      <div class="mx-auto flex max-w-2xl flex-col gap-6 p-4 @md:p-6">
        <Section title="Durations" description="Changes apply from the next phase.">
          {#each number_rows as row (row.key)}
            <SettingRow label={row.label} description={row.description}>
              {#snippet children({ id, describedby })}
                <Input
                  {id}
                  aria-describedby={describedby}
                  type="number"
                  size="sm"
                  class="w-20 text-right font-mono tabular-nums"
                  min={LIMITS[row.key][0]}
                  max={LIMITS[row.key][1]}
                  bind:value={() => settings[row.key], (input) => set_number(row.key, input)}
                />
              {/snippet}
            </SettingRow>
          {/each}
        </Section>

        <Section title="Flow" description="What happens when a phase ends.">
          {#each switch_rows as row (row.key)}
            <SettingRow label={row.label} description={row.description}>
              {#snippet children({ id, describedby })}
                <Switch {id} aria-describedby={describedby} bind:checked={timer.file.value.settings[row.key]} />
              {/snippet}
            </SettingRow>
          {/each}
        </Section>

        <Section title="Alerts" description="How a phase end reaches you.">
          <SettingRow label="Sound" description="A soft chime at the end of each phase, once you've clicked somewhere in WebOS.">
            {#snippet children({ id, describedby })}
              <IconButton label="Play the chime" size="sm" onclick={play_chime}><SpeakerHigh /></IconButton>
              <Switch {id} aria-describedby={describedby} bind:checked={timer.file.value.settings.sound} />
            {/snippet}
          </SettingRow>
          <SettingRow label="Browser notifications" description="Phase ends show even with Pomodoro closed, while WebOS is open in a tab.">
            {#snippet children({ id, describedby })}
              {#if permission === "granted"}
                <span {id} class="text-ui text-foreground/65">Allowed</span>
              {:else if permission === "denied"}
                <span {id} class="text-ui text-foreground/65">Blocked in the browser</span>
              {:else if permission === "unsupported"}
                <span {id} class="text-ui text-foreground/65">Not supported</span>
              {:else}
                <Button {id} aria-describedby={describedby} size="sm" onclick={allow_notifications}>Allow</Button>
              {/if}
            {/snippet}
          </SettingRow>
        </Section>

        <Section title="Reset" description="Removes every recorded focus session. Settings and the running timer stay.">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <span class="text-ui text-foreground/80">{all_time.sessions} sessions, {format_minutes(all_time.ms)}</span>
            <Button variant="danger" size="sm" onclick={clear_stats} disabled={all_time.sessions === 0}>Clear statistics</Button>
          </div>
        </Section>
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if timer.ready}
      <span>{PHASE_LABELS[run.phase]}{run.status === Status.RUNNING ? ` · ends ${format_clock(run.ends_at ?? 0)}` : run.status === Status.PAUSED ? " · paused" : ""}</span>
      <span class="hidden @sm:inline">Today {today_stats.sessions} · {format_minutes(today_stats.ms)}</span>
      <span class="hidden @md:inline">Streak {day_streak} {day_streak === 1 ? "day" : "days"}</span>
    {/if}
  </StatusBar>
</div>
