<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    columns,
    empty = false,
    empty_text = "Nothing here.",
    children,
  }: { columns: string[]; empty?: boolean; empty_text?: string; children: Snippet } = $props();
</script>

{#if empty}
  <p class="text-ui text-foreground/65">{empty_text}</p>
{:else}
  <div class="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
    <table class="w-full text-left text-ui">
      <thead class="bg-foreground/6 text-2xs tracking-wide text-foreground/80 uppercase">
        <tr>
          {#each columns as column (column)}
            <th class="px-2 py-1 font-medium whitespace-nowrap">{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody class="font-mono [&_td]:px-2 [&_td]:py-1 [&_td]:whitespace-nowrap [&_tr]:border-t [&_tr]:border-foreground/8">
        {@render children()}
      </tbody>
    </table>
  </div>
{/if}
