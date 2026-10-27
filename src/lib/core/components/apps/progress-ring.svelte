<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    percent: number;
    radius?: number;
    stroke?: number;
    class?: string;
  }

  let { percent, radius = 10, stroke = 2.5, class: class_name = "" }: Props = $props();
</script>

<svg viewBox="0 0 24 24" class={cn("-rotate-90", class_name)} aria-hidden="true">
  <circle cx="12" cy="12" r={radius} fill="none" stroke-width={stroke} class="stroke-foreground/20" />
  <circle
    cx="12"
    cy="12"
    r={radius}
    fill="none"
    stroke-width={stroke}
    stroke-linecap="round"
    pathLength="100"
    stroke-dasharray="100"
    stroke-dashoffset={100 - percent}
    class="stroke-primary transition-[stroke-dashoffset] duration-300"
  />
</svg>
