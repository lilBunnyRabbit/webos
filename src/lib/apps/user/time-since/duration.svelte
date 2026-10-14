<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { duration_parts, format_duration } from "./counters";

  let { ms, class: class_name }: { ms: number; class?: string } = $props();

  const parts = $derived(duration_parts(ms));
</script>

<span class={cn("inline-flex items-baseline gap-[0.3em] font-mono tabular-nums", class_name)}>
  <span class="sr-only">{format_duration(ms)}</span>
  {#each parts as part (part.unit)}
    <span aria-hidden="true">{part.value}<span class="ml-[0.08em] text-[0.55em] opacity-70">{part.unit}</span></span>
  {/each}
</span>
