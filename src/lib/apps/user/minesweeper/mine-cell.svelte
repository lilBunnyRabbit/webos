<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Bomb as BombIcon, Flag as FlagIcon, X as XIcon } from "phosphor-svelte";
  import { Cell } from "./game";

  // Primary stays out: in Brand Dark it's the same green as 2, and it means selection everywhere else.
  const NUMBER_COLOURS = [
    "",
    "text-info",
    "text-success",
    "text-error",
    "text-secondary",
    "text-accent",
    "text-tertiary",
    "text-foreground",
    "text-foreground/65",
  ];

  interface Props {
    index: number;
    row: number;
    col: number;
    cell: Cell;
    mine: boolean;
    count: number;
    active: boolean;
    finished: boolean;
    lost: boolean;
    exploded: boolean;
    element?: HTMLButtonElement;
    onopen: (index: number) => void;
    onfocus: (index: number) => void;
  }

  // Primitive props only, so a move re-renders just the cells whose values changed.
  let { index, row, col, cell, mine, count, active, finished, lost, exploded, element = $bindable(), onopen, onfocus }: Props = $props();

  const shown = $derived(cell === Cell.REVEALED);
  const exposed_mine = $derived(lost && mine && cell === Cell.HIDDEN);
  const wrong_flag = $derived(lost && cell === Cell.FLAGGED && !mine);

  const label = $derived.by(() => {
    let state: string;
    if (cell === Cell.FLAGGED) state = "flagged";
    else if (cell === Cell.HIDDEN) state = finished && mine ? "mine" : "hidden";
    else if (mine) state = "mine";
    else state = count ? `${count} nearby` : "empty";
    return `Row ${row + 1}, column ${col + 1}, ${state}`;
  });
</script>

<button
  bind:this={element}
  type="button"
  role="gridcell"
  data-cell={index}
  tabindex={active ? 0 : -1}
  aria-label={label}
  aria-disabled={finished || (shown && !count)}
  onclick={() => onopen(index)}
  onfocus={() => onfocus(index)}
  class={cn(
    "grid place-items-center rounded-[18%] font-mono leading-none font-bold transition-[background-color] duration-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
    shown ? "bg-foreground/4" : "bg-foreground/14 shadow-raised",
    !shown && !finished && "cursor-pointer hover:bg-foreground/20",
    shown && mine && exploded && "bg-error/30",
    shown && !mine && NUMBER_COLOURS[count]
  )}
>
  {#if cell === Cell.FLAGGED}
    {#if wrong_flag}
      <XIcon weight="bold" class="size-[60%] text-error" />
    {:else}
      <FlagIcon weight="fill" class="size-[55%] text-error" />
    {/if}
  {:else if (shown && mine) || exposed_mine}
    <BombIcon weight="fill" class={cn("size-[60%]", exposed_mine ? "text-foreground/65" : "text-error")} />
  {:else if shown && count}
    {count}
  {/if}
</button>
