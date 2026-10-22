<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import DayEntries from "./day-entries.svelte";
  import { mood_fill } from "./icons";
  import type { IndexEntry } from "./journal";
  import MoodLegend from "./mood-legend.svelte";
  import { add_days, add_months, local_date, MOOD_LABELS, month_grid, mood_level, type DayStat } from "./mood";

  interface Props {
    index: readonly IndexEntry[];
    days: ReadonlyMap<string, DayStat>;
    today: string;
    onopen: (meta: IndexEntry) => void;
  }

  let { index, days, today, onopen }: Props = $props();

  let month = $state(untrack(() => today.slice(0, 7)));
  let selected = $state(untrack(() => today));
  let grid_element = $state<HTMLDivElement>();

  const weeks = $derived(month_grid(month));
  const title = $derived(local_date(`${month}-01`).toLocaleDateString([], { month: "long", year: "numeric" }));
  const weekdays = Array.from({ length: 7 }, (_, i) => local_date(add_days("2024-01-01", i)).toLocaleDateString([], { weekday: "narrow" }));
  const written = $derived([...days.keys()].filter((date) => date.startsWith(`${month}-`)).length);
  const chosen = $derived(index.filter((meta) => meta.date === selected));

  function describe(date: string): string {
    const stat = days.get(date);
    const name = local_date(date).toLocaleDateString([], { month: "long", day: "numeric" });
    if (!stat) return name;
    const mood = stat.mood === null ? "no mood" : MOOD_LABELS[mood_level(stat.mood)];
    return `${name}: ${stat.entries} ${stat.entries === 1 ? "entry" : "entries"}, ${mood}`;
  }

  function go(by: number) {
    month = add_months(month, by);
    selected = `${month}-01`;
  }

  function on_key(event: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    selected = add_days(selected, step);
    month = selected.slice(0, 7);
    queueMicrotask(() => grid_element?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus());
  }
</script>

<div class="mx-auto grid w-full max-w-md gap-4 p-4">
  <div class="flex items-center gap-2">
    <IconButton label="Previous month" size="sm" onclick={() => go(-1)}><CaretLeftIcon weight="bold" /></IconButton>
    <h2 class="min-w-0 flex-1 text-center text-sm font-semibold">{title}</h2>
    <IconButton label="Next month" size="sm" onclick={() => go(1)}><CaretRightIcon weight="bold" /></IconButton>
  </div>

  <div class="grid gap-1">
    <div class="grid grid-cols-7 gap-1" aria-hidden="true">
      {#each weekdays as weekday, i (i)}<span class="text-center text-2xs text-foreground/65">{weekday}</span>{/each}
    </div>
    <div bind:this={grid_element} role="grid" aria-label={title} class="grid gap-1" tabindex="-1" onkeydown={on_key}>
      {#each weeks as week, w (w)}
        <div role="row" class="grid grid-cols-7 gap-1">
          {#each week as date, d (d)}
            {#if date}
              {@const stat = days.get(date)}
              <button
                type="button"
                role="gridcell"
                data-date={date}
                tabindex={date === selected ? 0 : -1}
                aria-selected={date === selected}
                aria-label={describe(date)}
                class={cn(
                  "relative aspect-square min-h-10 rounded-md p-1 text-left align-top font-mono text-2xs tabular-nums hover:opacity-85 focus-visible:ring-2 focus-visible:ring-cottontail",
                  mood_fill(stat?.mood, stat !== undefined),
                  date === selected && "outline-2 outline-offset-1 outline-foreground",
                  date === today && "font-bold underline underline-offset-2"
                )}
                onclick={() => (selected = date)}
              >
                <span class="absolute top-1 left-1.5">{Number(date.slice(8))}</span>
              </button>
            {:else}
              <span role="gridcell"></span>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <div class="grid gap-2">
    <p class="text-ui text-foreground/65"><span class="font-mono text-foreground tabular-nums">{written}</span> {written === 1 ? "day" : "days"} written</p>
    <MoodLegend />
  </div>

  <DayEntries date={selected} entries={chosen} stat={days.get(selected)} {onopen} />
</div>
