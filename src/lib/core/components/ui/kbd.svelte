<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<kbd class="inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-foreground/8 px-1 font-mono text-2xs text-foreground/80 ring-1 ring-inset ring-foreground/10">
  {@render children()}
</kbd>
