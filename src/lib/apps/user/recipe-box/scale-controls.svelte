<script lang="ts">
  import { IconButton, Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Minus as MinusIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { UnitSystem } from "./constants";

  interface Props {
    /** Servings when the recipe says how many it makes, otherwise a multiplier. */
    amount: number;
    base: number | null;
    system: UnitSystem;
    class?: string;
  }

  let { amount = $bindable(), base, system = $bindable(), class: class_name }: Props = $props();

  const step = $derived(base === null ? 0.5 : 1);
  const label = $derived(base === null ? `×${amount}` : `${amount} ${amount === 1 ? "serving" : "servings"}`);
</script>

<div class={cn("flex flex-wrap items-center gap-x-3 gap-y-2", class_name)}>
  <div class="flex items-center gap-1" role="group" aria-label={base === null ? "Scale" : "Servings"}>
    <IconButton size="sm" variant="secondary" label="Fewer" disabled={amount <= step} onclick={() => (amount = Math.max(step, amount - step))}><MinusIcon /></IconButton>
    <output class="min-w-20 text-center font-mono text-xs tabular-nums" aria-live="polite">{label}</output>
    <IconButton size="sm" variant="secondary" label="More" onclick={() => (amount += step)}><PlusIcon /></IconButton>
  </div>
  <Segmented
    size="sm"
    label="Units"
    options={[
      { value: UnitSystem.WRITTEN, label: "As written" },
      { value: UnitSystem.METRIC, label: "Metric" },
      { value: UnitSystem.IMPERIAL, label: "Imperial" },
    ]}
    bind:value={system}
  />
</div>
