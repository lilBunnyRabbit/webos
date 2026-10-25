<script lang="ts">
  import { keep_hyphenated } from "./identity";

  let { text }: { text: string } = $props();

  const parts = $derived(keep_hyphenated(text));
</script>

{#each parts as part, i (i)}{#if part.keep}<span class="whitespace-nowrap">{part.text}</span>{:else}{part.text}{/if}{/each}
