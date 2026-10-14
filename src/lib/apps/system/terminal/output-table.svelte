<script lang="ts">
  import kernel, { type ShellService, type Tagged, type Value } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { cell } from "./blocks";

  const ROW_LIMIT = 500;

  let { type, columns, rows }: { type: string | null; columns: string[]; rows: { [key: string]: Value }[] } = $props();

  const shell = $derived(kernel.service<ShellService>("shell"));
  const value_type = $derived(type ? shell.value_type(type) : undefined);
  const open = $derived(value_type?.open);
  let expanded = $state(false);
  const shown = $derived(expanded ? rows : rows.slice(0, ROW_LIMIT));
  const numeric = $derived(columns.map((column) => rows.slice(0, 20).every((row) => typeof row[column] === "number" || row[column] === null)));
</script>

<div class="max-w-full overflow-x-auto">
  <table class="w-max min-w-0 border-collapse text-left">
    <thead>
      <tr>
        {#each columns as column, index (column)}
          <th class={cn("px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase first:pl-0", numeric[index] && "text-right")}>{column}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each shown as row, row_index (row_index)}
        <tr
          class={cn(open && "cursor-pointer hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none")}
          tabindex={open ? 0 : undefined}
          onclick={() => open?.(row as Tagged)}
          onkeydown={(event) => {
            if (open && event.key === "Enter") {
              event.preventDefault();
              open(row as Tagged);
            }
          }}
        >
          {#each columns as column, index (column)}
            <td class={cn("px-2 py-px whitespace-pre first:pl-0", numeric[index] ? "text-right text-foreground/80 tabular-nums" : index === 0 && open && "text-primary")}>{cell(row, column, value_type)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if rows.length > shown.length}
    <button type="button" class="mt-1 text-foreground/65 hover:text-foreground" onclick={() => (expanded = true)}>… {rows.length - shown.length} more</button>
  {/if}
</div>
