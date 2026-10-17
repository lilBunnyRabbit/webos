<script lang="ts">
  import { EmptyState } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Table as TableIcon } from "phosphor-svelte";
  import { adjust, format_amount } from "./amounts";
  import type { UnitSystem } from "./constants";
  import type { Recipe } from "./cooklang";
  import StepText from "./step-text.svelte";
  import { recipe_tree, table_layout, type TableCell } from "./table";

  interface Props {
    recipe: Recipe;
    title: string;
    factor: number;
    system: UnitSystem;
  }

  const { recipe, title, factor, system }: Props = $props();

  const tree = $derived(recipe_tree(recipe));
  const layout = $derived(table_layout(tree, title));
  const rows = $derived(
    Array.from({ length: layout.rows }, (_, row) => layout.cells.filter((cell) => cell.row === row))
  );

  function key(cell: TableCell) {
    return `${cell.row}:${cell.column}`;
  }
</script>

{#if layout.rows === 0}
  <EmptyState icon={TableIcon} title="Nothing to tabulate" description="The table needs steps with ingredients marked as @name." />
{:else}
  <div class="flex flex-col gap-4 p-4 @lg:p-6">
    {#if tree.prep.length > 0}
      <ul class="flex flex-col gap-1 text-ui text-foreground/80">
        {#each tree.prep as step, index (index)}
          <li><span class="text-foreground/65">Before you start:</span> <StepText items={step.items} {factor} {system} /></li>
        {/each}
      </ul>
    {/if}
    <div class="overflow-x-auto overscroll-x-contain rounded-md ring-1 ring-foreground/12">
      <table class="w-full min-w-max border-collapse text-ui">
        <caption class="sr-only">{title}: ingredients on the left, each step joins the rows it spans, the dish on the right</caption>
        <tbody>
          {#each rows as cells, row (row)}
            <tr>
              {#each cells as cell (key(cell))}
                {@const node = cell.node}
                <td
                  rowspan={cell.rows}
                  colspan={cell.columns}
                  class={cn(
                    "border border-foreground/12 px-2.5 py-1.5 align-middle",
                    node.kind === "ingredient" && "bg-background-light",
                    node.kind === "step" && "max-w-72 min-w-40 leading-5",
                    node.kind === "dish" && "bg-primary/12 text-center font-semibold text-primary"
                  )}
                >
                  {#if node.kind === "ingredient"}
                    <span class="flex items-baseline justify-between gap-3 whitespace-nowrap">
                      <span>{node.name}{#if node.note}<span class="text-foreground/65">, {node.note}</span>{/if}</span>
                      <span class="font-mono text-2xs text-foreground/80 tabular-nums">{format_amount(adjust(node.amount, factor, system))}</span>
                    </span>
                  {:else if node.kind === "step"}
                    <StepText items={node.step.items} {factor} {system} />
                  {:else}
                    {title}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="text-2xs text-foreground/65">
      Which steps combine is read from the text: a step joins earlier ones that share an ingredient it names again or the cookware it uses; new ingredients in new cookware start a new branch.
    </p>
  </div>
{/if}
