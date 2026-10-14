<script lang="ts">
  import kernel, { type ShellService, type Value } from "$lib/core/api";
  import { to_text } from "$lib/core/api/services/shell/values";
  import { to_blocks } from "./blocks";
  import OutputTable from "./output-table.svelte";

  let { values }: { values: Value[] } = $props();

  const shell = $derived(kernel.service<ShellService>("shell"));
  const blocks = $derived(to_blocks(values, (type) => shell.value_type(type)));
</script>

{#each blocks as block, index (index)}
  {#if block.kind === "text"}
    <pre class="font-mono break-words whitespace-pre-wrap">{block.text}</pre>
  {:else if block.kind === "record"}
    <dl class="grid w-max max-w-full grid-cols-[auto_1fr] gap-x-3">
      {#each Object.entries(block.value).filter(([key]) => key !== "$type") as [key, item] (key)}
        <dt class="text-foreground/65">{key}</dt>
        <dd class="break-words whitespace-pre-wrap">{to_text(item, (type) => shell.value_type(type))}</dd>
      {/each}
    </dl>
  {:else}
    <OutputTable type={block.type} columns={block.columns} rows={block.rows} />
  {/if}
{/each}
