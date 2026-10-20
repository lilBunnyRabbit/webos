<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Plus as PlusIcon, Stack as StackIcon } from "phosphor-svelte";
  import type { List } from "./data";
  import { left_count } from "./items";
  import ListMark from "./list-mark.svelte";

  interface Props {
    lists: List[];
    /** A list id, or `null` for All. */
    active: string | null;
    onselect: (id: string | null) => void;
    onnew: () => void;
    class?: string;
  }

  let { lists, active, onselect, onnew, class: class_name }: Props = $props();

  const total = $derived(lists.reduce((sum, list) => sum + left_count(list), 0));
  const chip = "flex h-9 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-1.5 text-sm ring-1 transition-colors ring-inset pointer-coarse:h-10";
  const look = (on: boolean) => (on ? "bg-foreground text-background ring-foreground font-medium" : "text-foreground ring-foreground/15 hover:bg-foreground/6");

  // `container: "nearest"` keeps the scroll inside the chip row; without it the window scrolls too.
  const reveal = (on: boolean) => (element: HTMLElement) => {
    if (on) element.scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" } as ScrollIntoViewOptions);
  };
</script>

<nav aria-label="Lists" class={cn("flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]", class_name)}>
  <button type="button" class={cn(chip, "pl-2.5", look(active === null))} aria-current={active === null ? "page" : undefined} {@attach reveal(active === null)} onclick={() => onselect(null)}>
    <StackIcon weight="bold" class="size-4" /> All
    <span class="font-mono text-2xs tabular-nums opacity-70">{total}</span>
  </button>
  {#each lists as list (list.id)}
    <button type="button" class={cn(chip, look(active === list.id))} aria-current={active === list.id ? "page" : undefined} {@attach reveal(active === list.id)} onclick={() => onselect(list.id)}>
      <ListMark {list} size="sm" class="rounded-full" />
      <span class="max-w-40 truncate">{list.name}</span>
      <span class="font-mono text-2xs tabular-nums opacity-70">{left_count(list)}</span>
    </button>
  {/each}
  <IconButton label="New list" class="shrink-0 rounded-full" onclick={onnew}><PlusIcon weight="bold" /></IconButton>
</nav>
