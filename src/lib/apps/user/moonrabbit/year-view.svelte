<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import DayEntries from "./day-entries.svelte";
  import { mood_fill } from "./icons";
  import type { IndexEntry } from "./journal";
  import MoodLegend from "./mood-legend.svelte";
  import { add_days, add_months, days_in_month, local_date, MOOD_LABELS, mood_level, type DayStat } from "./mood";

  interface Props {
    index: readonly IndexEntry[];
    days: ReadonlyMap<string, DayStat>;
    today: string;
    onopen: (meta: IndexEntry) => void;
  }

  let { index, days, today, onopen }: Props = $props();

  let year = $state(untrack(() => Number(today.slice(0, 4))));
  let selected = $state(untrack(() => today));
  let grid_element = $state<HTMLDivElement>();

  const months = $derived(Array.from({ length: 12 }, (_, m) => ({ index: m + 1, length: days_in_month(year, m + 1) })));
  const month_names = Array.from({ length: 12 }, (_, m) => local_date(`2024-${String(m + 1).padStart(2, "0")}-01`).toLocaleDateString([], { month: "narrow" }));
  const rated = $derived([...days.values()].filter((day) => day.date.startsWith(`${year}-`) && day.mood !== null).length);
  const written = $derived([...days.keys()].filter((date) => date.startsWith(`${year}-`)).length);
  const chosen = $derived(index.filter((meta) => meta.date === selected));

  function key(month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function describe(date: string): string {
    const stat = days.get(date);
    const name = local_date(date).toLocaleDateString([], { month: "long", day: "numeric" });
    if (!stat) return name;
    return `${name}: ${stat.mood === null ? "written, no mood" : MOOD_LABELS[mood_level(stat.mood)]}`;
  }

  function go(by: number) {
    year += by;
    selected = `${year}-01-01`;
  }

  function on_key(event: KeyboardEvent) {
    const [y, , d] = selected.split("-").map(Number);
    let next: string | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = add_days(selected, event.key === "ArrowLeft" ? -1 : 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const month = add_months(selected.slice(0, 7), event.key === "ArrowUp" ? -1 : 1);
      const [ny, nm] = month.split("-").map(Number);
      next = `${month}-${String(Math.min(d, days_in_month(ny, nm))).padStart(2, "0")}`;
    }
    if (!next || Number(next.slice(0, 4)) !== y) return;
    event.preventDefault();
    selected = next;
    queueMicrotask(() => grid_element?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus());
  }
</script>

<div class="mx-auto grid w-full max-w-5xl gap-4 p-4">
  <div class="flex items-center gap-2">
    <IconButton label="Previous year" size="sm" onclick={() => go(-1)}><CaretLeftIcon weight="bold" /></IconButton>
    <h2 class="min-w-0 flex-1 text-center text-sm font-semibold"><span class="font-mono tabular-nums">{year}</span> in pixels</h2>
    <IconButton label="Next year" size="sm" onclick={() => go(1)}><CaretRightIcon weight="bold" /></IconButton>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys move the one focusable day: a roving tabindex) -->
  <div bind:this={grid_element} class="pixels" role="group" aria-label={`${year}, one square a day`} tabindex="-1" onkeydown={on_key}>
    {#each month_names as name, m (m)}
      <span class="label month text-2xs text-foreground/65" style:--m={m + 2} aria-hidden="true">{name}</span>
    {/each}
    {#each Array.from({ length: 31 }, (_, d) => d + 1) as day (day)}
      <span class={cn("label day font-mono text-2xs text-foreground/65 tabular-nums", day % 5 !== 1 && day !== 31 && "faint")} style:--d={day + 1} aria-hidden="true">{day}</span>
    {/each}
    {#each months as month (month.index)}
      {#each Array.from({ length: month.length }, (_, d) => d + 1) as day (day)}
        {@const date = key(month.index, day)}
        {@const stat = days.get(date)}
        <button
          type="button"
          data-date={date}
          tabindex={date === selected ? 0 : -1}
          aria-pressed={date === selected}
          aria-label={describe(date)}
          title={describe(date)}
          style:--m={month.index + 1}
          style:--d={day + 1}
          class={cn(
            "cell rounded-[3px] hover:opacity-85 focus-visible:ring-2 focus-visible:ring-cottontail",
            mood_fill(stat?.mood, stat !== undefined),
            date === selected && "outline-2 outline-offset-1 outline-foreground",
            date === today && "ring-2 ring-foreground ring-inset"
          )}
          onclick={() => (selected = date)}
        ></button>
      {/each}
    {/each}
  </div>

  <div class="grid gap-2">
    <p class="text-ui text-foreground/65">
      <span class="font-mono text-foreground tabular-nums">{written}</span>
      {written === 1 ? "day" : "days"} written, <span class="font-mono text-foreground tabular-nums">{rated}</span> with a mood
    </p>
    <MoodLegend />
  </div>

  <DayEntries date={selected} entries={chosen} stat={days.get(selected)} {onopen} />
</div>

<style>
  /* A phone shows months as columns and scrolls down the days; a wide window turns it so the year fits on screen. */
  .pixels {
    display: grid;
    grid-template-columns: 1.5rem repeat(12, minmax(0, 1fr));
    grid-auto-rows: 1.25rem;
    gap: 3px;
  }

  .pixels .month {
    grid-row: 1;
    grid-column: var(--m);
    text-align: center;
  }

  .pixels .day {
    grid-column: 1;
    grid-row: var(--d);
    align-self: center;
  }

  .pixels .cell {
    grid-column: var(--m);
    grid-row: var(--d);
  }

  @container (width >= 44rem) {
    .pixels {
      grid-template-columns: 1.5rem repeat(31, minmax(0, 1fr));
      grid-auto-rows: auto;
      grid-template-rows: 1rem repeat(12, minmax(0, 1fr));
    }

    .pixels .month {
      grid-column: 1;
      grid-row: var(--m);
      align-self: center;
    }

    .pixels .day {
      grid-row: 1;
      grid-column: var(--d);
      text-align: center;
    }

    .pixels .faint {
      visibility: hidden;
    }

    .pixels .cell {
      grid-row: var(--m);
      grid-column: var(--d);
      aspect-ratio: 1;
    }
  }
</style>
