<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { format_value, series_paths, value_range, type Series } from "./chart";

  interface Props {
    times: readonly number[];
    series: readonly Series[];
    shared: boolean;
    /** Bumped by the caller when the arrays above change in place. */
    tick: number;
  }

  let { times, series, shared, tick }: Props = $props();

  const WIDTH = 600;
  const HEIGHT = 200;

  let cursor = $state<number | null>(null);
  let pointer_kind = "mouse";

  const paths = $derived.by(() => {
    void tick;
    return series_paths(series, times.length, WIDTH, HEIGHT, shared);
  });
  const range = $derived.by(() => {
    void tick;
    return shared ? value_range(series.map((entry) => entry.values)) : null;
  });

  const index = $derived.by(() => {
    void tick;
    if (!times.length) return null;
    return cursor === null ? times.length - 1 : Math.min(times.length - 1, Math.max(0, Math.round(cursor * (times.length - 1))));
  });

  function place(event: PointerEvent) {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    cursor = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  }

  function on_key(event: KeyboardEvent) {
    if (!times.length) return;
    const step = 1 / Math.max(1, times.length - 1);
    const current = cursor ?? 1;
    if (event.key === "ArrowLeft") cursor = Math.max(0, current - step * (event.shiftKey ? 30 : 1));
    else if (event.key === "ArrowRight") cursor = Math.min(1, current + step * (event.shiftKey ? 30 : 1));
    else if (event.key === "Escape") cursor = null;
    else return;
    event.preventDefault();
  }
</script>

<div class="flex min-w-0 flex-col gap-1.5">
  <div class="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-2xs text-foreground/65 tabular-nums" aria-live="off">
    {#if index !== null}
      <span>t {times[index].toFixed(2)} s{cursor === null ? "" : " · cursor"}</span>
      {#each series as entry (entry.name)}
        <span class="flex items-center gap-1">
          <span class={cn("size-2 rounded-full", entry.fill)}></span>
          <span class="text-foreground">{entry.name}</span>
          {format_value(entry.values[index])}
        </span>
      {/each}
    {:else}
      <span>Press play to record values.</span>
    {/if}
  </div>
  <svg
    viewBox="0 0 {WIDTH} {HEIGHT}"
    preserveAspectRatio="none"
    class="block h-40 w-full touch-pan-y rounded-md bg-[light-dark(var(--background-lightest),var(--background-darker))] outline-none focus-visible:ring-2 focus-visible:ring-cottontail @lg:h-48"
    role="slider"
    tabindex="0"
    aria-label="Graph of {series.map((entry) => entry.name).join(', ') || 'nothing yet'} over time. Left and right arrows move the cursor, Escape clears it."
    aria-valuemin={times[0] ?? 0}
    aria-valuemax={times.at(-1) ?? 0}
    aria-valuenow={index === null ? 0 : times[index]}
    aria-valuetext={index === null ? "No data" : `${times[index].toFixed(2)} seconds`}
    onpointerdown={(event) => {
      pointer_kind = event.pointerType;
      place(event);
    }}
    onpointermove={(event) => {
      pointer_kind = event.pointerType;
      if (event.pointerType === "mouse" || event.buttons) place(event);
    }}
    onpointerleave={() => {
      if (pointer_kind === "mouse") cursor = null;
    }}
    onkeydown={on_key}
  >
    {#if range && range.min < 0 && range.max > 0}
      {@const zero = HEIGHT - ((0 - range.min) / (range.max - range.min)) * HEIGHT}
      <line x1="0" x2={WIDTH} y1={zero} y2={zero} class="stroke-foreground/15" stroke-width="1" vector-effect="non-scaling-stroke" />
    {/if}
    {#each paths as path, position (series[position]?.name ?? position)}
      <path d={path} fill="none" class={series[position]?.stroke} stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    {/each}
    {#if cursor !== null}
      <line x1={cursor * WIDTH} x2={cursor * WIDTH} y1="0" y2={HEIGHT} class="stroke-foreground/50" stroke-width="1" vector-effect="non-scaling-stroke" />
    {/if}
  </svg>
  {#if range}
    <div class="flex justify-between font-mono text-2xs text-foreground/65 tabular-nums">
      <span>{format_value(range.min)} … {format_value(range.max)}</span>
    </div>
  {/if}
</div>
