<script lang="ts">
  import { format_amount, profit, type Books } from "./game";

  let { books, class: class_name = "" }: { books: Books; class?: string } = $props();

  const money = (cents: number) => format_amount(cents, true);
  const net = $derived(profit(books));
  const lines = $derived([
    { label: "Takings", value: books.takings, sign: "+" },
    { label: "Wages", value: books.wages, sign: "−" },
    { label: "Bills", value: books.bills, sign: "−" },
    { label: "Stock", value: books.stock, sign: "−" },
  ]);
</script>

<dl class="grid grid-cols-[1fr_auto] gap-x-4 font-mono text-2xs tabular-nums {class_name}" aria-label="The day's books">
  {#each lines as line (line.label)}
    <dt class="text-foreground/65">{line.label}</dt>
    <dd class="text-right">{line.value > 0 ? line.sign : ""}{money(line.value)}</dd>
  {/each}
  <dt class="mt-0.5 border-t border-dashed border-foreground/20 pt-0.5 font-semibold">Profit</dt>
  <dd class="mt-0.5 border-t border-dashed border-foreground/20 pt-0.5 text-right font-semibold {net < 0 ? 'text-error' : 'text-success'}">
    {money(net)}
  </dd>
</dl>
