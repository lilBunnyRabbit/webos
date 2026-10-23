<script lang="ts">
  import { IconButton, Section } from "$lib/core/components/ui";
  import { format_date, format_datetime } from "$lib/core/utils";
  import { X } from "phosphor-svelte";
  import { duration_of, format_duration, heatmap_of, stats_of, type Run } from "./counters";

  interface Props {
    runs: Run[];
    onremove: (index: number) => void;
  }

  let { runs, onremove }: Props = $props();

  const CHART_RUNS = 20;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const CELL = 14;
  const LEFT = 30;
  const TOP = 16;

  const stats = $derived(stats_of(runs));
  const chart = $derived.by(() => {
    const recent = runs.slice(-CHART_RUNS);
    const longest = Math.max(1, ...recent.map(duration_of));
    return recent.map((run) => ({ run, ms: duration_of(run), pct: (duration_of(run) / longest) * 100 }));
  });
  const heatmap = $derived(heatmap_of(runs));
  const heat_max = $derived(Math.max(1, ...heatmap.flat()));
  const newest_first = $derived(runs.map((run, index) => ({ run, index })).reverse());

  const tiles = $derived(
    stats
      ? [
          { label: "Runs", value: String(stats.count) },
          { label: "Average", value: format_duration(stats.average) },
          { label: "Shortest", value: format_duration(stats.shortest) },
          { label: "Longest", value: format_duration(stats.longest) },
        ]
      : []
  );
</script>

{#if stats}
  <div class="grid grid-cols-2 gap-2 @lg:grid-cols-4">
    {#each tiles as tile (tile.label)}
      <div class="rounded-lg bg-background-light px-3 py-2 shadow-card ring-1 ring-hairline">
        <div class="text-2xs tracking-wide text-foreground/65 uppercase">{tile.label}</div>
        <div class="truncate font-mono text-sm tabular-nums">{tile.value}</div>
      </div>
    {/each}
  </div>

  {#if chart.length > 1}
    <Section title="Run lengths" description={runs.length > CHART_RUNS ? `The last ${CHART_RUNS} runs, oldest at the top.` : "Every run, oldest at the top."}>
      <ol class="grid gap-1 p-3">
        {#each chart as bar, i (i)}
          <li class="flex items-center gap-2" title="{format_datetime(bar.run.started_at)} – {format_datetime(bar.run.ended_at)}">
            <span class="w-14 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{format_date(bar.run.ended_at).replace(/,? \d{4}$/, "")}</span>
            <span class="h-3 min-w-0 flex-1">
              <span class="block h-full rounded-sm bg-primary/60" style:width="{Math.max(bar.pct, 2)}%"></span>
            </span>
            <span class="w-20 shrink-0 text-right font-mono text-2xs text-foreground/80 tabular-nums">{format_duration(bar.ms)}</span>
          </li>
        {/each}
      </ol>
    </Section>
  {/if}

  <Section title="When you reset" description="By weekday and hour of day.">
    <div class="overflow-x-auto p-3">
      <svg viewBox="0 0 {24 * CELL + LEFT} {7 * CELL + TOP}" class="w-full min-w-80" role="img" aria-label="Resets by weekday and hour">
        {#each { length: 8 } as _, i (i)}
          <text x={LEFT + i * 3 * CELL + 6} y="10" text-anchor="middle" class="fill-foreground/65 font-mono" font-size="8">{String(i * 3).padStart(2, "0")}</text>
        {/each}
        {#each heatmap as row, day (day)}
          <text x="0" y={TOP + day * CELL + 9} class="fill-foreground/65 font-mono" font-size="8">{DAYS[day]}</text>
          {#each row as count, hour (hour)}
            <rect
              x={LEFT + hour * CELL}
              y={TOP + day * CELL}
              width="12"
              height="12"
              rx="2"
              class={count === 0 ? "fill-foreground" : "fill-primary"}
              fill-opacity={count === 0 ? 0.06 : 0.2 + (count / heat_max) * 0.8}
            >
              <title>{DAYS[day]} {String(hour).padStart(2, "0")}:00, {count} {count === 1 ? "reset" : "resets"}</title>
            </rect>
          {/each}
        {/each}
      </svg>
    </div>
  </Section>

  <Section title="Runs" description="Deleting the newest run undoes the reset that ended it.">
    <ul class="p-1">
      {#each newest_first as entry (entry.index)}
        <li class="group flex h-8 items-center gap-2 rounded-md px-2 pointer-coarse:h-10">
          <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/65 tabular-nums">
            {format_datetime(entry.run.started_at)}<span class="hidden @md:inline">{" – "}{format_datetime(entry.run.ended_at)}</span>
          </span>
          <span class="shrink-0 font-mono text-2xs tabular-nums">{format_duration(duration_of(entry.run))}</span>
          <IconButton
            label="Delete run"
            size="sm"
            class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            onclick={() => onremove(entry.index)}
          >
            <X />
          </IconButton>
        </li>
      {/each}
    </ul>
  </Section>
{:else}
  <p class="py-2 text-center text-ui text-foreground/65">No runs yet. Each reset adds one here.</p>
{/if}
