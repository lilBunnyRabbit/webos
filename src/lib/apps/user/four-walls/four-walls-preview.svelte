<script lang="ts">
  import { PIECE_TOKENS, SHAPES, type Piece } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
  } from "phosphor-svelte";
  import { screen_rotation, type Direction } from "./game";

  let { piece, direction = null, dim = false }: { piece: Piece | null; direction?: Direction | null; dim?: boolean } =
    $props();

  const ARROWS = { down: ArrowDownIcon, left: ArrowLeftIcon, up: ArrowUpIcon, right: ArrowRightIcon };
  const LABELS = { down: "down", left: "left", up: "up", right: "right" };

  const cells = $derived.by(() => {
    if (!piece) return [];
    const shape = SHAPES[piece][direction ? screen_rotation(direction) : 0];
    const left = Math.min(...shape.map((cell) => cell.x));
    const top = Math.min(...shape.map((cell) => cell.y));
    return shape.map((cell) => ({ col: cell.x - left + 1, row: cell.y - top + 1 }));
  });
  const cols = $derived(Math.max(0, ...cells.map((cell) => cell.col)));
  const Arrow = $derived(direction ? ARROWS[direction] : null);
</script>

<div
  class="flex items-center gap-[calc(var(--mini)*0.3)]"
  role="img"
  aria-label={piece ? `${piece.toUpperCase()} piece${direction ? `, going ${LABELS[direction]}` : ""}` : "Empty"}
>
  <div class="grid size-[calc(var(--mini)*4)] place-items-center">
    {#if piece}
      <div
        class={cn("grid gap-[calc(var(--mini)*0.08)] transition-opacity", dim && "opacity-38")}
        style:grid-template-columns="repeat({cols}, var(--mini))"
        style:grid-auto-rows="var(--mini)"
      >
        {#each cells as cell, i (i)}
          <span
            class="rounded-[calc(var(--mini)*0.18)]"
            style:background-color="var(--{PIECE_TOKENS[piece]})"
            style:grid-column={cell.col}
            style:grid-row={cell.row}
          ></span>
        {/each}
      </div>
    {/if}
  </div>
  {#if Arrow && piece}<Arrow weight="bold" class="size-[calc(var(--mini)*1.1)] shrink-0 text-foreground/65" />{/if}
</div>
