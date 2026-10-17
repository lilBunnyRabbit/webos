<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { PIECE_TOKENS } from "./draw";
  import { SHAPES, type Piece } from "./game";

  let { piece, dim = false }: { piece: Piece | null; dim?: boolean } = $props();

  const cells = $derived.by(() => {
    if (!piece) return [];
    const shape = SHAPES[piece][0];
    const left = Math.min(...shape.map((cell) => cell.x));
    const top = Math.min(...shape.map((cell) => cell.y));
    return shape.map((cell) => ({ col: cell.x - left + 1, row: cell.y - top + 1 }));
  });
  const cols = $derived(Math.max(0, ...cells.map((cell) => cell.col)));
</script>

<div class="grid h-[calc(var(--mini)*2)] w-[calc(var(--mini)*4)] place-items-center">
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
