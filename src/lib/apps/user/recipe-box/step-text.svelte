<script lang="ts">
  import { adjust, format_amount } from "./amounts";
  import type { UnitSystem } from "./constants";
  import type { StepItem, Timer } from "./cooklang";

  interface Props {
    items: StepItem[];
    factor: number;
    system: UnitSystem;
    ontimer?: (timer: Timer) => void;
  }

  const { items, factor, system, ontimer }: Props = $props();
</script>

<!-- Inline, no whitespace between nodes: the text items already carry their own spaces. -->
{#each items as item, index (index)}{#if item.kind === "text"}<span class="whitespace-pre-line">{item.value}</span>{:else if item.kind === "ingredient"}<span class="font-medium text-primary"
      >{item.name}{#if item.amount}<span class="ml-1 font-mono text-[0.85em] font-normal text-primary/80">{format_amount(adjust(item.amount, factor, system))}</span
        >{/if}</span
    >{:else if item.kind === "cookware"}<span class="font-medium text-secondary">{item.name}</span>{:else if ontimer}<button
      type="button"
      class="mx-0.5 inline rounded-md bg-tertiary/15 px-1.5 font-medium text-tertiary hover:opacity-85 active:opacity-70"
      onclick={() => ontimer(item)}>{item.name ? `${item.name} ` : ""}{format_amount(item.amount)}</button
    >{:else}<span class="font-medium text-tertiary">{item.name ? `${item.name} ` : ""}{format_amount(item.amount)}</span>{/if}{/each}
