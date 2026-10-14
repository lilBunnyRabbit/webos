<script lang="ts">
  import { Button, EmptyState, Input, Switch } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Alarm as AlarmIcon, Trash } from "phosphor-svelte";
  import { check_alarm, format_until, new_id, repeat_label, WEEK, type Alarm, type AlarmDraft } from "./clock";
  import type { ClockFile } from "./ringer.svelte";

  let {
    file,
    now,
    draft = $bindable(null),
    onsave,
    ondelete,
  }: {
    file: ClockFile;
    now: number;
    draft?: AlarmDraft | null;
    onsave: () => void;
    ondelete: (alarm: Alarm) => void;
  } = $props();

  const alarms = $derived(
    file.value.alarms.map((alarm) => ({ alarm, check: check_alarm(alarm, now) })).sort((a, b) => a.alarm.time.localeCompare(b.alarm.time))
  );

  function edit(alarm: Alarm) {
    draft = { id: alarm.id, time: alarm.time, days: [...alarm.days], label: alarm.label };
  }

  function toggle(alarm: Alarm, enabled: boolean) {
    alarm.enabled = enabled;
    alarm.snooze_until = null;
    if (enabled) alarm.armed_at = Date.now();
  }

  function toggle_day(day: number) {
    if (!draft) return;
    draft.days = draft.days.includes(day) ? draft.days.filter((entry) => entry !== day) : [...draft.days, day];
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft || !/^\d{2}:\d{2}$/.test(draft.time)) return;
    const changes = { time: draft.time, days: [...draft.days].sort(), label: draft.label.trim(), enabled: true, armed_at: Date.now(), snooze_until: null };
    const existing = file.value.alarms.find((alarm) => alarm.id === draft?.id);
    if (existing) Object.assign(existing, changes);
    else file.value.alarms.push({ id: new_id(), last_fired: null, ...changes });
    draft = null;
    onsave();
  }

  const editing = $derived(draft?.id ? (file.value.alarms.find((alarm) => alarm.id === draft?.id) ?? null) : null);
</script>

{#if draft}
  <form class="h-full overflow-auto" onsubmit={save}>
    <div class="mx-auto grid max-w-md gap-5 p-4 @md:p-6">
      <h2 class="text-lg font-medium">{draft.id ? "Edit alarm" : "New alarm"}</h2>
      <label class="grid gap-1.5">
        <span class="text-2xs tracking-wide text-foreground/65 uppercase">Time</span>
        <input
          type="time"
          required
          bind:value={draft.time}
          class="h-16 rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 text-center font-mono text-4xl font-medium tabular-nums ring-1 ring-foreground/30 ring-inset focus-visible:outline-2 focus-visible:outline-cottontail [&::-webkit-calendar-picker-indicator]:opacity-50"
        />
      </label>
      <fieldset class="grid gap-1.5">
        <legend class="mb-1.5 text-2xs tracking-wide text-foreground/65 uppercase">Repeat · {repeat_label(draft.days)}</legend>
        <div class="grid grid-cols-7 gap-1">
          {#each WEEK as entry (entry.day)}
            <Button variant="quiet" size="md" class="px-0" pressed={draft.days.includes(entry.day)} title={entry.short} aria-label={entry.short} onclick={() => toggle_day(entry.day)}>
              <span class="@sm:hidden">{entry.initial}</span><span class="hidden @sm:inline">{entry.short}</span>
            </Button>
          {/each}
        </div>
      </fieldset>
      <label class="grid gap-1.5">
        <span class="text-2xs tracking-wide text-foreground/65 uppercase">Label</span>
        <Input bind:value={draft.label} placeholder="Optional, like Wake up" maxlength={60} />
      </label>
      <div class="flex items-center gap-2">
        {#if editing}
          {@const alarm = editing}
          <Button variant="danger" size="md" onclick={() => ondelete(alarm)}><Trash weight="bold" />Delete</Button>
        {/if}
        <span class="flex-1"></span>
        <Button variant="quiet" size="md" onclick={() => (draft = null)}>Cancel</Button>
        <Button variant="primary" size="md" type="submit">Save</Button>
      </div>
    </div>
  </form>
{:else if alarms.length === 0}
  <EmptyState icon={AlarmIcon} title="No alarms" description="Alarms ring while WebOS is open, from this window or the Clock widget on your desktop." />
{:else}
  <div class="h-full overflow-auto">
    <ul class="mx-auto grid max-w-2xl gap-1 p-2 @md:p-4" aria-label="Alarms">
      {#each alarms as { alarm, check } (alarm.id)}
        {@const on = alarm.enabled || check.snoozed}
        <li class="flex items-center gap-3 rounded-lg bg-background-light pr-3">
          <button type="button" class="grid min-w-0 flex-1 rounded-l-lg px-3 py-2.5 text-left hover:bg-foreground/4 focus-visible:bg-primary/12 focus-visible:outline-none" onclick={() => edit(alarm)}>
            <span class={cn("font-mono text-3xl leading-tight font-medium tabular-nums", !on && "text-foreground/45")}>{alarm.time}</span>
            <span class="truncate text-2xs text-foreground/65">
              {[alarm.label, repeat_label(alarm.days)].filter(Boolean).join(" · ")}{#if on && check.at !== null}
                <span class="text-primary">{` · ${check.snoozed ? "snoozed, rings " : ""}${format_until(check.at - now)}`}</span>{/if}
            </span>
          </button>
          <Switch checked={on} aria-label="{alarm.time} alarm on" onchange={(event) => toggle(alarm, event.currentTarget.checked)} />
        </li>
      {/each}
    </ul>
  </div>
{/if}
