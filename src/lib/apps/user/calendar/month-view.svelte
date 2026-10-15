<script lang="ts">
  import { day_minutes, format_hours } from "$lib/apps/user/work-hours/data";
  import { Button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ClockUser as ClockUserIcon, Kanban as KanbanIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { day_title, format_day, month_grid, month_of } from "./calendar";
  import { EVENT_CHIP, EVENT_DOT } from "./colors";
  import DayList from "./day-list.svelte";
  import type { CalendarActions, DaySources } from "./view";

  let {
    month,
    today,
    selected = $bindable(),
    sources,
    actions,
  }: { month: string; today: string; selected: string; sources: DaySources; actions: CalendarActions } = $props();

  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MAX_CHIPS = 3;

  const weeks = $derived(month_grid(month));
</script>

<div class="flex h-full flex-col overflow-auto @xl:grid @xl:grid-rows-[auto_minmax(0,1fr)] @xl:overflow-hidden">
  <div class="grid shrink-0 grid-cols-7 border-b border-foreground/8" aria-hidden="true">
    {#each WEEKDAYS as name (name)}
      <span class="px-2 py-1.5 text-center text-2xs font-medium tracking-wide text-foreground/65 uppercase @xl:text-left">
        <span class="@xl:hidden">{name.slice(0, 1)}</span><span class="hidden @xl:inline">{name.slice(0, 3)}</span>
      </span>
    {/each}
  </div>

  <div class="grid shrink-0 grid-cols-7 auto-rows-[4rem] @xl:min-h-0 @xl:auto-rows-fr" role="grid" aria-label="Month">
    {#each weeks as week, row (week[0])}
      <div class="contents" role="row">
        {#each week as day, column (day)}
          {@const events = sources.events(day)}
          {@const due = sources.due(day)}
          {@const worked = day_minutes(sources.work(day))}
          {@const outside = month_of(day) !== month}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            role="gridcell"
            tabindex="-1"
            aria-selected={day === selected}
            class={cn(
              "relative flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden p-1",
              column > 0 && "border-l border-foreground/8",
              row > 0 && "border-t border-foreground/8",
              outside && "bg-foreground/3",
              day === selected && "bg-primary/10"
            )}
            onclick={() => (selected = day)}
            ondblclick={() => actions.create(day)}
          >
            <div class="flex shrink-0 flex-col items-center @xl:flex-row @xl:justify-between">
              <button
                type="button"
                class={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full font-mono text-2xs tabular-nums hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-cottontail",
                  outside && "text-foreground/45",
                  day === today && "bg-primary font-semibold text-background hover:bg-primary hover:opacity-85"
                )}
                aria-label={format_day(day, { weekday: "long", month: "long", day: "numeric" })}
                aria-current={day === today ? "date" : undefined}
                onclick={(event) => {
                  event.stopPropagation();
                  if (selected === day) actions.show_day(day);
                  else selected = day;
                }}
              >
                {Number(day.slice(8))}
              </button>
              {#if worked > 0}
                <button
                  type="button"
                  class="flex min-w-0 items-center justify-center gap-1 rounded-sm font-mono text-2xs leading-4 text-foreground/65 tabular-nums hover:bg-foreground/6 hover:text-foreground focus-visible:outline-2 focus-visible:outline-cottontail @xl:px-1"
                  title="Worked {format_hours(worked)} h. Open Work Hours"
                  onclick={(click) => {
                    click.stopPropagation();
                    actions.open_work();
                  }}
                >
                  <ClockUserIcon class="hidden size-3 shrink-0 @xl:block" />{format_hours(worked)}
                </button>
              {/if}
            </div>

            <div class="flex flex-wrap justify-center gap-0.5 @xl:hidden" aria-hidden="true">
              {#each events.slice(0, 3) as occurrence (occurrence.event.id)}
                <span class={cn("size-1.5 rounded-full", EVENT_DOT[occurrence.event.color])}></span>
              {/each}
              {#if due.length}<span class="size-1.5 rounded-full ring-1 ring-foreground/65 ring-inset"></span>{/if}
            </div>

            <ul class="hidden min-h-0 flex-col gap-0.5 overflow-hidden @xl:flex">
              {#each [...events.map((occurrence) => ({ kind: "event" as const, occurrence })), ...due.map((entry) => ({ kind: "due" as const, entry }))].slice(0, MAX_CHIPS) as item (item.kind === "event" ? item.occurrence.event.id : item.entry.card.id)}
                <li class="min-w-0">
                  {#if item.kind === "event"}
                    {@const event = item.occurrence.event}
                    <button
                      type="button"
                      class={cn("flex w-full min-w-0 items-center gap-1 rounded-sm border-l-2 px-1.5 text-left text-2xs leading-5 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-cottontail", EVENT_CHIP[event.color])}
                      onclick={(click) => {
                        click.stopPropagation();
                        actions.open_event(item.occurrence);
                      }}
                    >
                      {#if !event.all_day}<span class="shrink-0 font-mono text-foreground/80 tabular-nums">{event.start}</span>{/if}
                      <span class="truncate">{event.title}</span>
                    </button>
                  {:else}
                    {@const { card, column: lane } = item.entry}
                    <button
                      type="button"
                      class="flex w-full min-w-0 items-center gap-1 rounded-sm bg-foreground/6 px-1.5 text-left text-2xs leading-5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-cottontail"
                      title="Due on Kanban: {card.title}"
                      onclick={(click) => {
                        click.stopPropagation();
                        actions.open_card(card.id);
                      }}
                    >
                      <KanbanIcon class="size-3 shrink-0 text-foreground/65" />
                      <span class={cn("truncate", lane.done && "text-foreground/55 line-through")}>{card.title || "Untitled card"}</span>
                    </button>
                  {/if}
                </li>
              {/each}
              {#if events.length + due.length > MAX_CHIPS}
                <li>
                  <button
                    type="button"
                    class="rounded-sm px-1.5 text-2xs leading-5 text-foreground/80 hover:bg-foreground/6 focus-visible:outline-2 focus-visible:outline-cottontail"
                    onclick={(click) => {
                      click.stopPropagation();
                      actions.show_day(day);
                    }}
                  >
                    +{events.length + due.length - MAX_CHIPS} more
                  </button>
                </li>
              {/if}
            </ul>

          </div>
        {/each}
      </div>
    {/each}
  </div>

  <section class="grid shrink-0 content-start gap-2 border-t border-foreground/8 p-2 @xl:hidden" aria-label="Selected day">
    <div class="flex items-center gap-2 px-1">
      <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{day_title(selected, today)}</h2>
      <Button variant="quiet" size="sm" onclick={() => actions.create(selected)}><PlusIcon weight="bold" />Event</Button>
    </div>
    <DayList day={selected} {sources} {actions} />
  </section>
</div>

