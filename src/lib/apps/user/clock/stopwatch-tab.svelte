<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowCounterClockwise, Flag, Pause, Play } from "phosphor-svelte";
  import { EMPTY_STOPWATCH, format_stopwatch, laps_of, stopwatch_elapsed, type StopwatchState } from "./clock";
  import { Ticker } from "./ticker.svelte";

  let { stopwatch, visible }: { stopwatch: { value: StopwatchState }; visible: boolean } = $props();

  const running = $derived(stopwatch.value.started_at !== null);
  const ticker = new Ticker(
    () => visible && running,
    () => 40
  );
  const elapsed = $derived(stopwatch_elapsed(stopwatch.value, running ? ticker.now : 0));
  const laps = $derived(laps_of(stopwatch.value));
  const current_lap = $derived(elapsed - (stopwatch.value.laps.at(-1) ?? 0));
  const extremes = $derived.by(() => {
    if (laps.length < 2) return null;
    const splits = laps.map((lap) => lap.split_ms);
    return { best: Math.min(...splits), worst: Math.max(...splits) };
  });

  function toggle() {
    const now = Date.now();
    const value = stopwatch.value;
    stopwatch.value = running
      ? { ...value, started_at: null, before_ms: stopwatch_elapsed(value, now) }
      : { ...value, started_at: now };
  }

  function lap() {
    stopwatch.value = { ...stopwatch.value, laps: [...stopwatch.value.laps, stopwatch_elapsed(stopwatch.value, Date.now())] };
  }
</script>

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
  <div class="grid justify-items-center gap-4 px-4 pt-8 pb-5">
    <p class="font-mono text-6xl leading-none font-bold tabular-nums @md:text-7xl" aria-live="off">{format_stopwatch(elapsed)}</p>
    {#if laps.length > 0}
      <p class="font-mono text-ui text-foreground/55 tabular-nums">Lap {laps.length + 1} · {format_stopwatch(current_lap)}</p>
    {/if}
    <div class="flex gap-2">
      {#if running}
        <Button size="lg" onclick={lap}><Flag weight="bold" />Lap</Button>
      {:else if elapsed > 0}
        <Button size="lg" onclick={() => (stopwatch.value = structuredClone(EMPTY_STOPWATCH))}><ArrowCounterClockwise weight="bold" />Reset</Button>
      {/if}
      <Button size="lg" variant="primary" class="min-w-28" onclick={toggle}>
        {#if running}<Pause weight="bold" />Stop{:else}<Play weight="bold" />{elapsed > 0 ? "Resume" : "Start"}{/if}
      </Button>
    </div>
  </div>

  {#if laps.length > 0}
    <div class="min-h-0 overflow-auto border-t border-foreground/8">
      <table class="mx-auto w-full max-w-md text-ui">
        <thead class="sticky top-0 bg-background">
          <tr class="text-2xs tracking-wide text-foreground/65 uppercase">
            <th class="h-8 px-4 text-left font-normal">Lap</th>
            <th class="h-8 px-4 text-right font-normal">Split</th>
            <th class="h-8 px-4 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody class="font-mono tabular-nums">
          {#each laps as lap (lap.n)}
            <tr class="border-t border-foreground/6">
              <td class="h-8 px-4 text-foreground/65">{lap.n}</td>
              <td class={cn("h-8 px-4 text-right", extremes && lap.split_ms === extremes.best && "text-success", extremes && lap.split_ms === extremes.worst && "text-error")}>
                {format_stopwatch(lap.split_ms)}
              </td>
              <td class="h-8 px-4 text-right text-foreground/65">{format_stopwatch(lap.total_ms)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
