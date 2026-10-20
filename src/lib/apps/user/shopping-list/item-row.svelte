<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { Check as CheckIcon, DotsThreeVertical as DotsThreeVerticalIcon } from "phosphor-svelte";
  import type { Item } from "./data";
  import { format_amount } from "./parse";

  interface Props {
    item: Item;
    store: boolean;
    ontoggle: () => void;
    onmenu: (anchor: Position) => void;
    onamount: () => void;
  }

  let { item, store, ontoggle, onmenu, onamount }: Props = $props();

  const amount = $derived(format_amount(item));

  let row = $state<HTMLElement | null>(null);

  function menu(point: Position) {
    // The keyboard's menu key reports no position.
    if (point.x || point.y || !row) return onmenu(point);
    const rect = row.getBoundingClientRect();
    onmenu({ x: rect.left + 16, y: rect.bottom });
  }

  function more(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu({ x: rect.left, y: rect.bottom + 4 });
  }
</script>

<li
  bind:this={row}
  {@attach store ? undefined : long_press({ on_menu: menu })}
  class={cn("flex items-center transition-colors hover:bg-foreground/4", item.checked && "text-foreground/55")}
  style:view-transition-name="item-{item.id}"
>
  <button
    type="button"
    role="checkbox"
    aria-checked={item.checked}
    class={cn(
      "flex min-w-0 flex-1 items-center gap-3 px-3 text-left outline-none select-none focus-visible:bg-primary/12 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset [-webkit-touch-callout:none]",
      store ? "min-h-16 text-lg" : "min-h-12 text-base pointer-coarse:min-h-14"
    )}
    onclick={ontoggle}
  >
    <span
      class={cn(
        "grid shrink-0 place-items-center rounded-full transition-colors",
        store ? "size-8" : "size-6",
        item.checked ? "bg-primary text-background" : "ring-2 ring-foreground/45 ring-inset"
      )}
    >
      {#if item.checked}<CheckIcon weight="bold" class={store ? "size-4.5" : "size-3.5"} />{/if}
    </span>
    <span class={cn("min-w-0 flex-1 break-words", item.checked ? "line-through decoration-foreground/40" : "font-medium text-foreground")}>{item.text}</span>
  </button>
  {#if amount}
    {@const pill = cn("shrink-0 rounded-full px-2.5 py-0.5 font-mono font-semibold tabular-nums", store ? "mr-3 text-base" : "text-sm", item.checked ? "text-foreground/55" : "bg-primary/18 text-foreground")}
    {#if store}
      <span class={pill}>{amount}</span>
    {:else}
      <button type="button" class="group grid min-h-10 shrink-0 place-items-center px-1 pointer-coarse:mr-2" aria-label="Amount of “{item.text}”: {amount}" onclick={onamount}>
        <span class={cn(pill, !item.checked && "group-hover:bg-primary/28")}>{amount}</span>
      </button>
    {/if}
  {/if}
  {#if !store}
    <IconButton label="More for “{item.text}”" class="mr-1 ml-1 shrink-0 text-foreground/65 pointer-coarse:hidden" onclick={more}>
      <DotsThreeVerticalIcon weight="bold" />
    </IconButton>
  {/if}
</li>
