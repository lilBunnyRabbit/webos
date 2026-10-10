<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-wrap gap-x-6 gap-y-2">
  {@render children()}
</div>
