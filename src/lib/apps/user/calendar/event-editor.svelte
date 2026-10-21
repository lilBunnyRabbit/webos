<script lang="ts">
  import { Button, Input, Select, Switch, Textarea } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { draft_error, EVENT_COLORS, format_day, REMINDER_OPTIONS, Repeat, repeat_label, type EventDraft } from "./calendar";
  import { COLOR_NAMES, EVENT_DOT } from "./colors";
  import { reminder_error } from "./reminders";

  let {
    draft = $bindable(),
    occurrence_day,
    onsave,
    ondelete,
    oncancel,
  }: {
    draft: EventDraft;
    occurrence_day: string | null;
    onsave: () => void;
    ondelete: (only: string | null) => void;
    oncancel: () => void;
  } = $props();

  let tried = $state(false);
  const reminder_problem = $derived(reminder_error(draft));
  const error = $derived(draft_error(draft) ?? reminder_problem);

  const REPEATS = [
    { value: "none", label: "Does not repeat" },
    { value: Repeat.DAILY, label: "Daily" },
    { value: Repeat.WEEKLY, label: "Weekly" },
    { value: Repeat.MONTHLY, label: "Monthly" },
    { value: Repeat.YEARLY, label: "Yearly" },
  ];

  const reminders = $derived(
    draft.all_day ? REMINDER_OPTIONS.map((option) => (option.value === "0" ? { ...option, label: "At 09:00 on the day" } : option)) : REMINDER_OPTIONS
  );

  function submit(event: SubmitEvent) {
    event.preventDefault();
    tried = true;
    if (!error) onsave();
  }

  const overline = "text-2xs font-medium tracking-wide text-foreground/65 uppercase";
</script>

<form class="h-full overflow-auto" onsubmit={submit} novalidate>
  <div class="mx-auto grid max-w-lg gap-5 p-4 @md:p-6">
    <h2 class="text-lg font-semibold">{draft.id ? "Edit event" : "New event"}</h2>

    <label class="grid gap-1.5">
      <span class={overline}>Title</span>
      <Input bind:value={draft.title} placeholder="Like Dentist or Mia's birthday" maxlength={120} autofocus={!draft.id} />
    </label>

    <div class="grid gap-3 @sm:grid-cols-[1fr_auto] @sm:items-end">
      <label class="grid gap-1.5">
        <span class={overline}>Day</span>
        <Input type="date" bind:value={draft.day} required class="font-mono" />
      </label>
      <label class="flex h-8 items-center gap-2 text-ui pointer-coarse:h-10">
        <Switch bind:checked={draft.all_day} />All day
      </label>
    </div>

    {#if !draft.all_day}
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1.5">
          <span class={overline}>Starts</span>
          <Input type="time" bind:value={draft.start} required class="font-mono" />
        </label>
        <label class="grid gap-1.5">
          <span class={overline}>Ends</span>
          <Input type="time" bind:value={draft.end} required class="font-mono" />
        </label>
      </div>
    {/if}

    <div class="grid gap-3 @sm:grid-cols-2">
      <label class="grid gap-1.5">
        <span class={overline}>Repeat</span>
        <Select bind:value={draft.repeat} options={REPEATS} />
      </label>
      {#if draft.repeat !== "none"}
        <label class="grid gap-1.5">
          <span class={overline}>Until <span class="normal-case">(optional)</span></span>
          <Input type="date" bind:value={draft.until} min={draft.day} class="font-mono" />
        </label>
      {/if}
    </div>
    {#if draft.repeat !== "none" && !error}
      <p class="-mt-3 text-2xs text-foreground/80">{repeat_label({ every: draft.repeat, until: draft.until || null }, draft.day)}</p>
    {/if}

    <label class="grid gap-1.5">
      <span class={overline}>Reminder</span>
      <Select bind:value={draft.reminder} options={reminders} />
    </label>
    {#if reminder_problem}
      <p class="-mt-3 text-2xs text-error">{reminder_problem}</p>
    {/if}

    <fieldset class="grid gap-1.5">
      <legend class={cn(overline, "mb-1.5")}>Colour</legend>
      <div class="flex flex-wrap gap-1.5">
        {#each EVENT_COLORS as color (color)}
          <button
            type="button"
            class={cn(
              "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-background hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail pointer-coarse:size-10",
              EVENT_DOT[color],
              draft.color === color && "ring-2 ring-foreground"
            )}
            aria-label={COLOR_NAMES[color]}
            title={COLOR_NAMES[color]}
            aria-pressed={draft.color === color}
            onclick={() => (draft.color = color)}
          >
            {#if draft.color === color}<CheckIcon weight="bold" class="size-4 text-background" />{/if}
          </button>
        {/each}
      </div>
    </fieldset>

    <label class="grid gap-1.5">
      <span class={overline}>Notes</span>
      <Textarea bind:value={draft.notes} placeholder="Where, who, what to bring" rows={3} />
    </label>

    {#if tried && error}
      <p class="text-ui text-error" role="alert">{error}</p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      {#if draft.id}
        <Button variant="danger" size="md" onclick={() => ondelete(null)}><TrashIcon weight="bold" />{draft.repeat === "none" ? "Delete" : "Delete all"}</Button>
        {#if draft.repeat !== "none" && occurrence_day}
          <Button variant="quiet" size="md" title="Delete only the {format_day(occurrence_day)} occurrence" onclick={() => ondelete(occurrence_day)}>Delete this one</Button>
        {/if}
      {/if}
      <span class="flex-1"></span>
      <Button variant="quiet" size="md" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" size="md" type="submit">Save</Button>
    </div>
  </div>
</form>
