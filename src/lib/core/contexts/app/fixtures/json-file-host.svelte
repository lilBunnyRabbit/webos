<script lang="ts">
  import Owner from "./json-file-owner.svelte";

  let { path, show = $bindable(true) }: { path: string; show?: boolean } = $props();
</script>

{#if show}<Owner {path} />{/if}
