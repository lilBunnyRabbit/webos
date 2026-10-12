<script lang="ts">
  /** Recent throughput samples in bytes per second, oldest first, drawn against a fixed 40-sample window. */
  let { samples, capacity = 40 }: { samples: number[]; capacity?: number } = $props();

  const WIDTH = 200;
  const HEIGHT = 40;
  const peak = $derived(Math.max(...samples, 1));
  const points = $derived(
    samples.map((value, index) => `${((capacity - samples.length + index) / (capacity - 1)) * WIDTH},${HEIGHT - (value / peak) * (HEIGHT - 2) - 1}`)
  );
</script>

<svg viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" class="h-10 w-full" aria-hidden="true">
  {#each [0.25, 0.5, 0.75] as line (line)}
    <line x1="0" x2={WIDTH} y1={HEIGHT * line} y2={HEIGHT * line} class="stroke-foreground/8" vector-effect="non-scaling-stroke" />
  {/each}
  {#if points.length > 1}
    <polygon points="{points[0].split(',')[0]},{HEIGHT} {points.join(' ')} {WIDTH},{HEIGHT}" class="fill-primary/12" />
    <polyline points={points.join(" ")} class="fill-none stroke-primary" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  {/if}
</svg>
