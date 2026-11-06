<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    /** Metres a second. */
    speed: number;
    /** Road vehicles read km/h, boats knots. */
    unit?: "kmh" | "kn";
    class?: string;
  }

  let { speed, unit = "kmh", class: class_name }: Props = $props();

  const shown = $derived(unit === "kn" ? (Math.abs(speed) * 1.943844).toFixed(1) : String(Math.round(Math.abs(speed) * 3.6)));
</script>

<div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", class_name)} aria-hidden="true">
  {shown} <span class="text-foreground/65">{unit === "kn" ? "kn" : "km/h"}</span>
</div>
