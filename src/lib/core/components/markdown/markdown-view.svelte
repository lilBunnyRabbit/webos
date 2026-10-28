<script lang="ts">
  import { parse_markdown, type Inline } from "$lib/core/utils/markdown";
  import { cn } from "$lib/core/utils";

  let { source, class: class_name }: { source: string; class?: string } = $props();

  const blocks = $derived(parse_markdown(source));
</script>

{#snippet inlines(parts: Inline[])}
  {#each parts as part, index (index)}
    {#if part.kind === "bold"}<strong class="font-semibold">{part.text}</strong>
    {:else if part.kind === "italic"}<em>{part.text}</em>
    {:else if part.kind === "code"}<code class="rounded-xs bg-foreground/8 px-1 font-mono text-2xs">{part.text}</code>
    {:else if part.kind === "link"}<a href={part.href} target="_blank" rel="noreferrer noopener" class="text-primary underline decoration-primary/40 underline-offset-2">{part.text}</a>
    {:else}{part.text}{/if}
  {/each}
{/snippet}

<div class={cn("grid gap-2 text-ui leading-relaxed break-words", class_name)}>
  {#each blocks as block, index (index)}
    {#if block.kind === "heading"}
      <p class={block.level === 1 ? "text-sm font-semibold" : "font-semibold"}>{@render inlines(block.inlines)}</p>
    {:else if block.kind === "list"}
      <ul class="grid list-disc gap-0.5 pl-5 marker:text-foreground/45">
        {#each block.items as item, i (i)}<li>{@render inlines(item)}</li>{/each}
      </ul>
    {:else}
      <p>
        {#each block.lines as line, i (i)}{#if i > 0}<br />{/if}{@render inlines(line)}{/each}
      </p>
    {/if}
  {/each}
</div>
