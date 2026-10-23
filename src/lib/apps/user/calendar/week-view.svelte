<script lang="ts">
  import { sorted_entries, type Entry } from "$lib/apps/user/work-hours/data";
  import { cn } from "$lib/core/utils";
  import { format_day, layout_timed, minutes_of, time_of } from "./calendar";
  import { EVENT_CHIP } from "./colors";
  import type { CalendarActions, DaySources } from "./view";

  let { days, today, now, sources, actions }: { days: string[]; today: string; now: number; sources: DaySources; actions: CalendarActions } = $props();

  const HOUR = 48;
  const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

  const MIN_MINUTES = 24;

  function timed(day: string) {
    return layout_timed(
      sources
        .events(day)
        .filter((occurrence) => !occurrence.event.all_day)
        .map((occurrence) => ({ occurrence, start: minutes_of(occurrence.event.start), end: minutes_of(occurrence.event.end) })),
      MIN_MINUTES
    );
  }

  function work_blocks(day: string): Entry[] {
    return sorted_entries(sources.work(day)).filter((entry) => minutes_of(entry.end) > minutes_of(entry.start));
  }

  const columns = $derived(`3rem repeat(${days.length}, minmax(0, 1fr))`);
  const now_minutes = $derived.by(() => {
    const date = new Date(now);
    return date.getHours() * 60 + date.getMinutes();
  });

  function create_at(day: string, event: MouseEvent) {
    const minutes = Math.floor(event.offsetY / HOUR) * 60 + (event.offsetY % HOUR >= HOUR / 2 ? 30 : 0);
    actions.create(day, Math.min(minutes, 23 * 60));
  }
</script>

<div class="grid h-full grid-rows-[auto_auto_minmax(0,1fr)]">
  <div class="grid overflow-hidden border-b border-hairline [scrollbar-gutter:stable]" style:grid-template-columns={columns}>
    <span></span>
    {#each days as day (day)}
      <div class="grid justify-items-center gap-0.5 border-l border-hairline py-1.5">
        <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{format_day(day, { weekday: "short" })}</span>
        <span
          class={cn("grid size-7 place-items-center rounded-full font-mono text-ui tabular-nums", day === today && "bg-primary font-semibold text-background")}
          aria-current={day === today ? "date" : undefined}>{Number(day.slice(8))}</span
        >
      </div>
    {/each}
  </div>

  <div class="grid max-h-28 overflow-y-auto border-b border-hairline [scrollbar-gutter:stable]" style:grid-template-columns={columns}>
    <span class="self-center pr-1 text-right text-2xs text-foreground/65">All day</span>
    {#each days as day (day)}
      <div class="grid min-w-0 content-start gap-0.5 border-l border-hairline p-0.5">
        {#each sources.events(day).filter((occurrence) => occurrence.event.all_day) as occurrence (occurrence.event.id)}
          <button
            type="button"
            class={cn("truncate rounded-sm border-l-2 px-1.5 text-left text-2xs leading-5 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail", EVENT_CHIP[occurrence.event.color])}
            onclick={() => actions.open_event(occurrence)}>{occurrence.event.title}</button
          >
        {/each}
        {#each sources.due(day) as { card, column } (card.id)}
          <button
            type="button"
            class={cn(
              "truncate rounded-sm bg-foreground/6 px-1.5 text-left text-2xs leading-5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-cottontail",
              column.done && "text-foreground/55 line-through"
            )}
            title="Due on Kanban: {card.title}"
            onclick={() => actions.open_card(card.id)}>{card.title || "Untitled card"}</button
          >
        {/each}
      </div>
    {/each}
  </div>

  <div class="overflow-y-auto [scrollbar-gutter:stable]" {@attach (node) => void (node.scrollTop = 7 * HOUR)}>
    <div class="relative grid" style:grid-template-columns={columns} style:height="{24 * HOUR}px">
      <div class="relative">
        {#each HOURS.slice(1) as hour (hour)}
          <span class="absolute right-1.5 -translate-y-1/2 font-mono text-2xs text-foreground/65 tabular-nums" style:top="{hour * HOUR}px">{time_of(hour * 60)}</span>
        {/each}
      </div>
      {#each days as day (day)}
        {@const blocks = work_blocks(day)}
        {@const inset = blocks.length > 0 ? 14 : 0}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="hours relative border-l border-hairline"
          style:--hour="{HOUR}px"
          ondblclick={(event) => event.target === event.currentTarget && create_at(day, event)}
        >
          {#each blocks as entry (entry.id)}
            <button
              type="button"
              class="absolute inset-x-0 grid content-start overflow-hidden border-l-2 border-dashed border-foreground/40 bg-foreground/5 px-1.5 py-0.5 text-left text-2xs text-foreground/80 hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-cottontail"
              style:top="{(minutes_of(entry.start) / 60) * HOUR}px"
              style:height="{((minutes_of(entry.end) - minutes_of(entry.start)) / 60) * HOUR}px"
              title="Worked {entry.start}–{entry.end}. Open Work Hours"
              onclick={actions.open_work}
            >
              <span class="truncate">{entry.description || "Work"} · <span class="font-mono tabular-nums">{entry.start}–{entry.end}</span></span>
            </button>
          {/each}
          {#each timed(day) as { item, column, columns: count } (item.occurrence.event.id)}
            {@const event = item.occurrence.event}
            {@const short = item.end - item.start < 45}
            <button
              type="button"
              class={cn(
                "absolute overflow-hidden rounded-sm border-l-2 px-1.5 text-left text-2xs shadow-raised hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail",
                short ? "flex items-center gap-1 leading-none" : "grid content-start py-0.5",
                EVENT_CHIP[event.color]
              )}
              style:top="{(item.start / 60) * HOUR}px"
              style:height="{(Math.max(item.end - item.start, MIN_MINUTES) / 60) * HOUR - 2}px"
              style:left="calc({(column / count) * (100 - inset) + inset}% + 1px)"
              style:width="calc({(100 - inset) / count}% - 3px)"
              onclick={() => actions.open_event(item.occurrence)}
            >
              <span class="truncate font-medium">{event.title}</span>
              <span class="truncate font-mono text-foreground/80 tabular-nums">{short ? event.start : `${event.start}–${event.end}`}</span>
            </button>
          {/each}
          {#if day === today}
            <div class="pointer-events-none absolute inset-x-0 h-0.5 bg-primary" style:top="{(now_minutes / 60) * HOUR}px" aria-hidden="true">
              <span class="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary"></span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .hours {
    background-image: linear-gradient(to bottom, var(--hairline) 1px, transparent 1px);
    background-size: 100% var(--hour);
  }
</style>
