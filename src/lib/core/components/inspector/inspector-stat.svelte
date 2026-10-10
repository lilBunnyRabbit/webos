<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, value, children }: { label: string; value?: string | number; children?: Snippet } = $props();
</script>

<div class="flex min-w-0 flex-col">
  <span class="text-[0.6875rem] uppercase tracking-wide text-foreground/50">{label}</span>
  <span class="truncate font-mono text-sm">
    {#if children}{@render children()}{:else}{value}{/if}
  </span>
</div>
