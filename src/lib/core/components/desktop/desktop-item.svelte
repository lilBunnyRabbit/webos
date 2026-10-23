<script lang="ts">
  import type { DesktopItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import DesktopItemFace from "./desktop-item-face.svelte";

  let {
    item,
    x,
    y,
    selected,
    dimmed,
    drop_target,
    onselect,
    onopen,
    onmenu,
    ondragstart,
    ondragend,
  }: {
    item: DesktopItem;
    x: number;
    y: number;
    selected: boolean;
    /** Being dragged, or cut to the clipboard. */
    dimmed: boolean;
    /** A folder that a drag hovering over it would drop into. */
    drop_target: boolean;
    onselect: (event: MouseEvent) => void;
    onopen: (event: MouseEvent) => void;
    onmenu: (event: MouseEvent) => void;
    ondragstart: (event: DragEvent) => void;
    ondragend: () => void;
  } = $props();
</script>

<button
  data-desktop-name={item.name}
  aria-pressed={selected}
  draggable="true"
  class={cn(
    "group group/tile flex size-full flex-col items-center gap-1.5 rounded-xl px-1 pt-2 transition-[background-color,opacity] duration-150 select-none",
    "hover:bg-foreground/6 focus-visible:bg-foreground/8",
    selected && "bg-primary/14 ring-1 ring-primary/40 ring-inset hover:bg-primary/18",
    drop_target && "bg-primary/18 ring-2 ring-primary/70 ring-inset",
    dimmed && "opacity-40"
  )}
  style:grid-column={x + 1}
  style:grid-row={y + 1}
  onclick={onselect}
  ondblclick={onopen}
  oncontextmenu={(event) => {
    event.preventDefault();
    event.currentTarget.focus();
    onmenu(event);
  }}
  {ondragstart}
  {ondragend}
>
  <DesktopItemFace {item} />
</button>
