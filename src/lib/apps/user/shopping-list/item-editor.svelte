<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Minus as MinusIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import type { Entry } from "./parse";

  interface Props {
    item: Entry;
    onsave: (entry: Entry) => void;
    oncancel: () => void;
  }

  let { item, onsave, oncancel }: Props = $props();

  const id = $props.id();

  const UNITS = ["", "g", "dag", "kg", "ml", "dl", "l", "pak"];
  /** A tap of − or + moves by an amount that suits the unit. */
  const STEP: Record<string, number> = { g: 50, ml: 50, kg: 0.5, l: 0.5 };

  let name = $state(untrack(() => item.text));
  let quantity = $state(untrack(() => (item.qty === undefined ? "" : String(item.qty).replace(".", ","))));
  let unit = $state(untrack(() => item.unit ?? ""));
  const units = $derived(UNITS.includes(unit) ? UNITS : [...UNITS, unit]);

  const value = $derived(quantity.trim() === "" ? undefined : Number(quantity.replace(",", ".")));
  const valid_amount = $derived(value === undefined || (Number.isFinite(value) && value > 0));
  const can_save = $derived(name.trim().length > 0 && valid_amount);
  const step = $derived(STEP[unit] ?? 1);

  const show = (number: number) => String(Math.round(number * 1000) / 1000).replace(".", ",");

  function nudge(direction: 1 | -1) {
    const current = value !== undefined && Number.isFinite(value) ? value : 0;
    const next = current + direction * step;
    quantity = next > 0 ? show(next) : "";
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!can_save) return;
    const text = name.trim().replace(/\s+/g, " ");
    onsave(value === undefined ? { text } : unit ? { text, qty: value, unit } : { text, qty: value });
  }
</script>

<form aria-label="Edit item" class="flex min-h-0 w-full flex-col" onsubmit={save}>
  <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4 pt-3">
    <label class="flex flex-col gap-1.5">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Name</span>
      <Input bind:value={name} size="lg" autocomplete="off" enterkeyhint="done" />
    </label>

    <div class="flex flex-col gap-1.5">
      <span id="{id}-amount" class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Amount</span>
      <div class="flex items-center gap-2">
        <IconButton label="Less" size="lg" variant="secondary" disabled={value === undefined} onclick={() => nudge(-1)}>
          <MinusIcon weight="bold" />
        </IconButton>
        <Input
          bind:value={quantity}
          size="lg"
          inputmode="decimal"
          placeholder="None"
          aria-labelledby="{id}-amount"
          aria-invalid={!valid_amount}
          class="w-24 text-center font-mono tabular-nums"
        />
        <IconButton label="More" size="lg" variant="secondary" onclick={() => nudge(1)}>
          <PlusIcon weight="bold" />
        </IconButton>
      </div>
      {#if !valid_amount}<p class="text-2xs text-error">A number above zero, or leave it empty.</p>{/if}
    </div>

    <div class="flex flex-col gap-1.5">
      <span id="{id}-unit" class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Unit</span>
      <div role="radiogroup" aria-labelledby="{id}-unit" class="flex flex-wrap gap-2">
        {#each units as option (option)}
          <button
            type="button"
            role="radio"
            aria-checked={unit === option}
            class={cn(
              "h-9 min-w-12 rounded-full px-3 font-mono text-sm ring-1 transition-colors ring-inset pointer-coarse:h-11",
              unit === option ? "bg-primary text-background ring-primary" : "text-foreground ring-foreground/20 hover:bg-foreground/6"
            )}
            onclick={() => (unit = option)}
          >
            {option || "×"}
          </button>
        {/each}
      </div>
    </div>
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
    <Button variant="quiet" onclick={oncancel}>Cancel</Button>
    <Button type="submit" variant="primary" disabled={!can_save}>Save</Button>
  </div>
</form>
