<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { value, label, done = false }: { value: number; label: string; done?: boolean } = $props();
</script>

<div
  class="h-1.5 overflow-hidden rounded-full bg-foreground/10"
  role="progressbar"
  aria-label={label}
  aria-valuenow={Math.round(value * 100)}
  aria-valuemin={0}
  aria-valuemax={100}
>
  <div class={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style:width="{Math.min(100, value * 100)}%"></div>
</div>
