<script lang="ts">
  import { MOOD_LABELS, local_date, mood_level, type WeekPoint } from "./mood";

  interface Props {
    points: readonly WeekPoint[];
  }

  let { points }: Props = $props();

  let width = $state(0);
  let active = $state<number | null>(null);

  const HEIGHT = 168;
  const TOP = 10;
  const BOTTOM = 22;
  const LEFT = 44;
  const RIGHT = 10;

  const plot_width = $derived(Math.max(1, width - LEFT - RIGHT));
  const step = $derived(points.length > 1 ? plot_width / (points.length - 1) : 0);

  function x(i: number): number {
    return LEFT + (points.length > 1 ? i * step : plot_width / 2);
  }

  function y(mood: number): number {
    return TOP + ((5 - mood) / 4) * (HEIGHT - TOP - BOTTOM);
  }

  const runs = $derived.by(() => {
    const out: { i: number; mood: number }[][] = [];
    let run: { i: number; mood: number }[] = [];
    points.forEach((point, i) => {
      if (point.mood === null) {
        if (run.length) out.push(run);
        run = [];
      } else run.push({ i, mood: point.mood });
    });
    if (run.length) out.push(run);
    return out;
  });

  const ticks = $derived.by(() => {
    const out: { i: number; label: string }[] = [];
    let last = -Infinity;
    points.forEach((point, i) => {
      const month = point.start.slice(0, 7);
      const previous = points[i - 1]?.start.slice(0, 7);
      if (i === 0 || month === previous) return;
      if (x(i) - last < 44) return;
      last = x(i);
      out.push({ i, label: local_date(point.start).toLocaleDateString([], { month: "short" }) });
    });
    return out;
  });

  function week_label(point: WeekPoint): string {
    return `Week of ${local_date(point.start).toLocaleDateString([], { month: "short", day: "numeric" })}`;
  }

  function on_move(event: PointerEvent) {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const i = step ? Math.round((event.clientX - box.left - LEFT) / step) : 0;
    active = Math.min(points.length - 1, Math.max(0, i));
  }

  const shown = $derived(active === null ? null : points[active]);
  const rated = $derived(points.filter((point) => point.mood !== null));
</script>

<figure class="grid min-w-0 gap-1">
  <div class="h-5 text-2xs text-foreground/80" aria-live="polite">
    {#if shown}
      {week_label(shown)}:
      {#if shown.mood === null}<span>no mood</span>{:else}<span class="font-mono text-foreground tabular-nums">{shown.mood.toFixed(1)}</span>
        {MOOD_LABELS[mood_level(shown.mood)]} · {shown.days} {shown.days === 1 ? "day" : "days"}{/if}
    {:else if rated.length}
      Tap or point at a week
    {/if}
  </div>
  <div bind:clientWidth={width} class="w-full min-w-0 overflow-hidden">
    {#if width}
      <svg {width} height={HEIGHT} role="img" aria-label="Average mood per week" class="block touch-pan-y" onpointermove={on_move} onpointerdown={on_move} onpointerleave={() => (active = null)}>
        {#each [1, 2, 3, 4, 5] as level (level)}
          <line x1={LEFT} x2={LEFT + plot_width} y1={y(level)} y2={y(level)} stroke="var(--foreground)" stroke-opacity={level === 3 ? 0.18 : 0.08} />
          <text x={LEFT - 6} y={y(level)} dy="0.32em" text-anchor="end" class="fill-foreground/65 text-2xs">{MOOD_LABELS[level as 1 | 2 | 3 | 4 | 5]}</text>
        {/each}
        {#each ticks as tick (tick.i)}
          <text x={x(tick.i)} y={HEIGHT - 6} text-anchor="middle" class="fill-foreground/65 text-2xs">{tick.label}</text>
        {/each}
        {#each runs as run, r (r)}
          {#if run.length > 1}
            <path
              d={`M${x(run[0].i)},${y(1)} ${run.map((p) => `L${x(p.i)},${y(p.mood)}`).join(" ")} L${x(run.at(-1)!.i)},${y(1)} Z`}
              fill="var(--primary)"
              fill-opacity="0.12"
            />
            <path d={run.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.mood)}`).join(" ")} fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          {/if}
          {#each run as p (p.i)}
            <circle cx={x(p.i)} cy={y(p.mood)} r={active === p.i ? 5 : 3.5} fill="var(--primary)" stroke="var(--background)" stroke-width="2" />
          {/each}
        {/each}
        {#if active !== null}
          <line x1={x(active)} x2={x(active)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="var(--foreground)" stroke-opacity="0.35" stroke-dasharray="3 3" />
        {/if}
      </svg>
    {/if}
  </div>
  <table class="sr-only">
    <caption>Average mood per week, 1 (awful) to 5 (great)</caption>
    <tbody>
      {#each points as point (point.start)}
        <tr><th scope="row">{week_label(point)}</th><td>{point.mood === null ? "no mood" : point.mood.toFixed(1)}</td></tr>
      {/each}
    </tbody>
  </table>
</figure>
