<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, value, children }: { label: string; value?: string | number; children?: Snippet } = $props();
</script>

<div class="flex min-w-0 flex-col">
  <span class="text-2xs font-medium tracking-wide text-foreground/80 uppercase">{label}</span>
  <span class="truncate font-mono text-ui">
    {#if children}{@render children()}{:else}{value}{/if}
  </span>
</div>
