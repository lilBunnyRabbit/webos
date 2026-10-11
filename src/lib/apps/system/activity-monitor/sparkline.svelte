<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    values: number[];
    /** Top of the scale. Defaults to the largest value. */
    max?: number;
    /** Slots on the x axis, so a filling series grows from the right. */
    size?: number;
    label: string;
    class?: string;
  }

  let { values, max, size = 60, label, class: class_name }: Props = $props();

  const top = $derived(Math.max(max ?? 0, ...values, 1));
  const points = $derived(
    values.map((value, i) => `${size - values.length + i + 1},${(1 - Math.min(value, top) / top) * 100}`).join(" ")
  );
</script>

<svg
  viewBox="0 -2 {size} 104"
  preserveAspectRatio="none"
  role="img"
  aria-label={label}
  class={cn("h-8 w-full overflow-visible text-primary", class_name)}
>
  <line x1="0" x2={size} y1="100" y2="100" class="stroke-foreground/12" stroke-width="1" vector-effect="non-scaling-stroke" />
  {#if values.length > 1}
    <polyline
      {points}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  {/if}
</svg>
