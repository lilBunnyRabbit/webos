<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  let {
    value,
    rest = false,
    thickness = 3,
    class: class_name,
    children,
  }: {
    value: number;
    rest?: boolean;
    thickness?: number;
    class?: string;
    children?: Snippet;
  } = $props();

  const radius = $derived(50 - thickness / 2 - 1);
</script>

<div class={cn("relative", class_name)}>
  <svg viewBox="0 0 100 100" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
    <circle cx="50" cy="50" r={radius} fill="none" stroke-width={thickness} class="stroke-foreground/8" />
    <circle
      cx="50"
      cy="50"
      r={radius}
      fill="none"
      stroke-width={thickness}
      stroke-linecap="round"
      pathLength="100"
      stroke-dasharray="100"
      stroke-dashoffset={100 * (1 - value)}
      class={cn("transition-[stroke-dashoffset] duration-300 ease-linear", rest ? "stroke-success" : "stroke-primary", value <= 0 && "opacity-0")}
    />
  </svg>
  {#if children}
    <div class="absolute inset-0 grid place-items-center">{@render children()}</div>
  {/if}
</div>
