<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { format_live, live_parts } from "./counters";

  let { ms, class: class_name }: { ms: number; class?: string } = $props();

  const parts = $derived(live_parts(ms));
</script>

<span class={cn("inline-flex items-baseline gap-[0.3em] font-mono tabular-nums", class_name)}>
  <span class="sr-only">{format_live(ms)}</span>
  {#each parts as part (part.unit)}
    <span aria-hidden="true">{part.value}<span class="ml-[0.08em] text-[0.55em] opacity-70">{part.unit}</span></span>
  {/each}
</span>
