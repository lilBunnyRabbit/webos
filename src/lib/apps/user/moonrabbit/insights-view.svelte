<script lang="ts">
  import { EmptyState, Section, Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ChartLine as ChartLineIcon } from "phosphor-svelte";
  import type { ActivityDef } from "./activities";
  import { activity_icon } from "./icons";
  import MoodChart from "./mood-chart.svelte";
  import { activity_stats, add_days, MOOD_LABELS, mood_level, split_stat, week_series, week_start, type DayStat } from "./mood";

  interface Props {
    days: ReadonlyMap<string, DayStat>;
    activities: readonly ActivityDef[];
    today: string;
  }

  let { days, activities, today }: Props = $props();

  let range = $state<"13" | "26" | "52">("13");

  const weeks = $derived(Number(range));
  const points = $derived(week_series(days, today, weeks));
  const from = $derived(add_days(week_start(today), -7 * (weeks - 1)));
  const in_range = $derived([...days.values()].filter((day) => day.date >= from && day.date <= today));
  const rated = $derived(in_range.filter((day) => day.mood !== null));
  const average = $derived(rated.length ? rated.reduce((sum, day) => sum + day.mood!, 0) / rated.length : null);
  const by_activity = $derived(activity_stats(in_range));
  const names = $derived(new Map(activities.map((activity) => [activity.id, activity])));
  const sleep = $derived(split_stat(in_range, "sleep"));
  const energy = $derived(split_stat(in_range, "energy"));
  const widest = $derived(Math.max(0.5, ...by_activity.map((stat) => Math.abs(stat.difference))));

  function signed(value: number): string {
    return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(1)}`;
  }
</script>

<div class="mx-auto grid w-full max-w-2xl min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-sm font-semibold">Mood over weeks</h2>
    <Segmented
      bind:value={range}
      label="Range"
      size="sm"
      options={[
        { value: "13", label: "3 months" },
        { value: "26", label: "6 months" },
        { value: "52", label: "Year" },
      ]}
    />
  </div>

  {#if !rated.length}
    <EmptyState icon={ChartLineIcon} title="No moods yet" description="Tap a face when you write, or on its own. A few days in, this fills up." class="py-8" />
  {:else}
    <MoodChart {points} />
    <p class="text-ui text-foreground/65">
      Average <span class="font-mono text-foreground tabular-nums">{average!.toFixed(1)}</span> ({MOOD_LABELS[mood_level(average!)]}) over
      <span class="font-mono text-foreground tabular-nums">{rated.length}</span>
      {rated.length === 1 ? "day" : "days"} with a mood.
    </p>

    <Section title="Activities and your days" description="Average mood on days with the activity, against days without it. Plain averages, not proof.">
      {#if by_activity.length}
        <ul class="grid gap-1.5 p-3">
          {#each by_activity as stat (stat.id)}
            {@const activity = names.get(stat.id)}
            {@const Icon = activity_icon(activity?.icon ?? "")}
            <li class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-ui">
              <span class="flex min-w-0 items-center gap-1.5"><Icon class="size-4 shrink-0 text-foreground/80" /><span class="truncate">{activity?.label ?? "Removed activity"}</span></span>
              <span class="relative h-3" aria-hidden="true">
                <span class="absolute inset-y-0 left-1/2 w-px bg-foreground/25"></span>
                <span
                  class={cn("absolute inset-y-0.5 rounded-sm", stat.difference >= 0 ? "left-1/2 bg-primary" : "right-1/2 bg-secondary")}
                  style:width={`${(Math.abs(stat.difference) / widest) * 50}%`}
                ></span>
              </span>
              <span class="w-24 text-right font-mono text-2xs text-foreground/80 tabular-nums">
                <span class="text-foreground">{signed(stat.difference)}</span> · {stat.days}d
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-ui text-foreground/65">Pick activities on a few days with a mood and they show up here.</p>
      {/if}
    </Section>

    {#if sleep || energy}
      <Section title="Sleep and energy">
        <ul class="grid gap-1 p-3 text-ui">
          {#if sleep}
            <li>
              Sleeping <span class="font-mono tabular-nums">{sleep.threshold} h</span> or more:
              <span class="font-mono tabular-nums">{sleep.above?.toFixed(1) ?? "–"}</span>; less:
              <span class="font-mono tabular-nums">{sleep.below?.toFixed(1) ?? "–"}</span>
            </li>
          {/if}
          {#if energy}
            <li>
              Energy <span class="font-mono tabular-nums">{energy.threshold}/10</span> or more:
              <span class="font-mono tabular-nums">{energy.above?.toFixed(1) ?? "–"}</span>; less:
              <span class="font-mono tabular-nums">{energy.below?.toFixed(1) ?? "–"}</span>
            </li>
          {/if}
        </ul>
      </Section>
    {/if}
  {/if}
</div>
