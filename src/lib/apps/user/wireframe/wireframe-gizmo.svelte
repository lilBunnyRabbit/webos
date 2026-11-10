<script lang="ts">
  import { AXIS_FILL, AXIS_STROKE } from "./colors";
  import { AXES, axis_vector } from "./model";
  import type { Basis } from "./projection";

  let { basis }: { basis: Basis } = $props();

  const R = 30;

  const arms = $derived.by(() => {
    const raw = AXES.map((axis) => {
      const v = axis_vector(axis);
      const x = basis.x.x * v.x + basis.x.y * v.y + basis.x.z * v.z;
      const y = basis.y.x * v.x + basis.y.y * v.y + basis.y.z * v.z;
      return { axis, x, y };
    });
    const longest = Math.max(...raw.map((arm) => Math.hypot(arm.x, arm.y)), 1e-9);
    return raw.map((arm) => ({ ...arm, x: (arm.x / longest) * R, y: (arm.y / longest) * R, short: Math.hypot(arm.x, arm.y) / longest < 0.2 }));
  });
</script>

<svg viewBox="-48 -48 96 96" class="size-20 overflow-visible" role="img" aria-label="Axes: X, Y and Z as they point on screen">
  {#each arms as arm (arm.axis)}
    {#if arm.short}
      <circle r="4" class={["fill-none", AXIS_STROKE[arm.axis]]} stroke-width="2" />
    {:else}
      <line x1={arm.x * 0.12} y1={arm.y * 0.12} x2={arm.x} y2={arm.y} class={AXIS_STROKE[arm.axis]} stroke-width="2.5" stroke-linecap="round" />
    {/if}
    <text
      x={arm.short ? 9 : arm.x * 1.3}
      y={arm.short ? -9 : arm.y * 1.3}
      text-anchor="middle"
      dominant-baseline="central"
      font-size="12"
      class={["font-mono font-bold", AXIS_FILL[arm.axis]]}>{arm.axis.toUpperCase()}</text
    >
  {/each}
</svg>
