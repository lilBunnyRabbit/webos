<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { Check as CheckIcon, DotsThreeVertical as DotsThreeVerticalIcon } from "phosphor-svelte";
  import type { Item } from "./data";
  import { format_amount } from "./parse";

  interface Props {
    item: Item;
    store: boolean;
    ontoggle: () => void;
    onmenu: (anchor: Position) => void;
  }

  let { item, store, ontoggle, onmenu }: Props = $props();

  const amount = $derived(format_amount(item));

  function context_menu(event: MouseEvent) {
    event.preventDefault();
    if (event.clientX || event.clientY) return onmenu({ x: event.clientX, y: event.clientY });
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu({ x: rect.left + 16, y: rect.bottom });
  }

  function more(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu({ x: rect.left, y: rect.bottom + 4 });
  }
</script>

<li class={cn("flex items-center rounded-lg transition-colors hover:bg-foreground/6", item.checked && "text-foreground/50")}>
  <button
    type="button"
    role="checkbox"
    aria-checked={item.checked}
    class={cn(
      "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-left outline-none focus-visible:bg-primary/12 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
      store ? "min-h-16 text-lg" : "min-h-11 text-sm pointer-coarse:min-h-13"
    )}
    onclick={ontoggle}
    oncontextmenu={store ? undefined : context_menu}
  >
    <span
      class={cn(
        "grid shrink-0 place-items-center rounded-full transition-colors",
        store ? "size-7" : "size-5",
        item.checked ? "bg-primary text-background" : "ring-2 ring-foreground/30 ring-inset"
      )}
    >
      {#if item.checked}<CheckIcon weight="bold" class={store ? "size-4" : "size-3"} />{/if}
    </span>
    <span class={cn("min-w-0 flex-1 break-words", item.checked && "line-through decoration-foreground/50")}>{item.text}</span>
    {#if amount}
      <span class={cn("shrink-0 font-mono text-foreground/65 tabular-nums", store ? "text-sm" : "text-2xs")}>{amount}</span>
    {/if}
  </button>
  {#if !store}
    <IconButton label="More for “{item.text}”" class="mr-1 shrink-0" onclick={more}>
      <DotsThreeVerticalIcon weight="bold" />
    </IconButton>
  {/if}
</li>
