<script lang="ts">
  import { parse_inline } from "$lib/core/utils/markdown";

  let { text }: { text: string } = $props();

  const parts = $derived(parse_inline(text));
</script>

{#each parts as part, index (index)}
  {#if part.kind === "bold"}<strong class="font-semibold">{part.text}</strong>
  {:else if part.kind === "italic"}<em>{part.text}</em>
  {:else if part.kind === "code"}<code class="rounded-xs bg-foreground/8 px-1 font-mono text-2xs">{part.text}</code>
  {:else if part.kind === "link"}<a href={part.href} target="_blank" rel="noreferrer noopener" class="text-primary underline decoration-primary/40 underline-offset-2">{part.text}</a>
  {:else}{part.text}{/if}
{/each}
