<script lang="ts">
  import { day_minutes, format_hours, sorted_entries } from "$lib/apps/user/work-hours/data";
  import { cn } from "$lib/core/utils";
  import { ArrowsClockwise, Bell, ClockUser, Kanban } from "phosphor-svelte";
  import { time_label } from "./calendar";
  import { EVENT_CHIP } from "./colors";
  import type { CalendarActions, DaySources } from "./view";

  let { day, sources, actions, empty = "Nothing planned" }: { day: string; sources: DaySources; actions: CalendarActions; empty?: string | null } = $props();

  const events = $derived(sources.events(day));
  const due = $derived(sources.due(day));
  const work = $derived(sources.work(day));
  const worked = $derived(day_minutes(work));
  const blocks = $derived(sorted_entries(work));
</script>

{#if events.length === 0 && due.length === 0 && worked === 0}
  {#if empty}<p class="px-3 py-2 text-ui text-foreground/65">{empty}</p>{/if}
{:else}
  <ul class="grid gap-1">
    {#each events as occurrence (occurrence.event.id)}
      {@const event = occurrence.event}
      <li>
        <button
          type="button"
          class={cn("flex w-full min-w-0 items-center gap-3 rounded-md border-l-3 px-3 py-2 text-left hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail", EVENT_CHIP[event.color])}
          onclick={() => actions.open_event(occurrence)}
        >
          <span class="w-20 shrink-0 font-mono text-2xs text-foreground/80 tabular-nums">{time_label(event)}</span>
          <span class="min-w-0 flex-1 truncate text-ui font-medium">{event.title}</span>
          {#if event.repeat}<ArrowsClockwise class="size-3.5 shrink-0 text-foreground/65" aria-label="Repeats" />{/if}
          {#if event.reminder !== null}<Bell class="size-3.5 shrink-0 text-foreground/65" aria-label="Reminder" />{/if}
        </button>
      </li>
    {/each}
    {#each due as { card, column, board } (card.id)}
      <li>
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-3 rounded-md bg-foreground/6 px-3 py-2 text-left hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-cottontail"
          onclick={() => actions.open_card(card.id)}
        >
          <span class="flex w-20 shrink-0 items-center gap-1 text-2xs text-foreground/80"><Kanban class="size-3.5" />Due</span>
          <span class={cn("min-w-0 flex-1 truncate text-ui", column.done && "text-foreground/65 line-through")}>{card.title || "Untitled card"}</span>
          <span class="hidden shrink-0 truncate text-2xs text-foreground/65 @sm:inline">{board.name} · {column.name}</span>
        </button>
      </li>
    {/each}
    {#if worked > 0}
      <li>
        <button
          type="button"
          class="flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
          onclick={actions.open_work}
        >
          <span class="flex w-20 shrink-0 items-center gap-1 text-2xs text-foreground/80"><ClockUser class="size-3.5" />Worked</span>
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 tabular-nums">
            {format_hours(worked)} h · {blocks.map((entry) => `${entry.start}–${entry.end}`).join(", ")}
          </span>
        </button>
      </li>
    {/if}
  </ul>
{/if}
