<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<kbd class="inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-raised px-1 font-mono text-2xs text-foreground/80 shadow-control ring-1 ring-inset ring-hairline">
  {@render children()}
</kbd>
