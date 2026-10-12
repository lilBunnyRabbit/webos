<script lang="ts">
  import { cn } from "$lib/core/utils";

  /** A progress bar drawn as blocks, like a chunk map. `value` is 0–1. */
  let { value, tone = "primary", class: class_name }: { value: number; tone?: "primary" | "success" | "error"; class?: string } = $props();
</script>

<div
  class={cn("blocks h-1.5 overflow-hidden rounded-xs bg-foreground/10", class_name)}
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(value * 100)}
>
  <div
    class={cn("h-full transition-[width] duration-300", tone === "success" ? "bg-success" : tone === "error" ? "bg-error" : "bg-primary")}
    style:width="{value * 100}%"
  ></div>
</div>

<style>
  .blocks {
    mask-image: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 7px);
  }
</style>
