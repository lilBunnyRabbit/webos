<script lang="ts">
  import { CopyButton, Input } from "$lib/core/components/ui";
  import { MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";
  import type { Color } from "./color";
  import { convert, format_color, MODELS } from "./models";

  let { color }: { color: Color } = $props();

  let filter = $state("");

  const rows = $derived(
    MODELS.map((model) => {
      const converted = convert(color, model);
      return { id: model.id, text: converted ? format_color(converted) : null };
    })
  );
  const shown = $derived.by(() => {
    const query = filter.trim().toLowerCase();
    return query ? rows.filter((row) => row.id.includes(query) || row.text?.toLowerCase().includes(query)) : rows;
  });
</script>

<p class="text-ui text-foreground/65">
  The current colour in every model the colour library knows, rounded to four decimals. Each value pastes back into Pick.
</p>

<Input size="sm" bind:value={filter} placeholder="Filter models" aria-label="Filter models" class="w-full @md:w-64">
  {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
</Input>

<ul class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
  {#each shown as row (row.id)}
    <li class="flex min-w-0 flex-col gap-0.5 px-3 py-2 @md:flex-row @md:items-center @md:gap-3">
      <span class="w-32 shrink-0 font-mono text-2xs font-medium text-foreground/80">{row.id}</span>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        {#if row.text}
          <span class="min-w-0 flex-1 font-mono text-2xs break-all select-all">{row.text}</span>
          <CopyButton text={row.text} label="Copy {row.id}" />
        {:else}
          <span class="flex-1 text-2xs text-foreground/80">Out of this model's number range</span>
        {/if}
      </div>
    </li>
  {:else}
    <li class="px-3 py-6 text-center text-ui text-foreground/65">No model matches “{filter.trim()}”.</li>
  {/each}
</ul>
