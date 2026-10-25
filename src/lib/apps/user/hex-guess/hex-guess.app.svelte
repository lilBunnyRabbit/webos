<script lang="ts">
  import ColorGame from "../color-recall/color-game.svelte";
  import { Mode } from "../color-recall/modes";
  import type { Seed } from "../color-recall/seed";
  import Board from "./board.svelte";
  import { hex_state_schema } from "./hex";

  let { seed, daily }: { seed?: Seed; daily?: string } = $props();
</script>

<ColorGame mode={Mode.HEX} {seed} {daily} keys="Type 0–9 A–F · Enter guesses · Backspace erases" schema={hex_state_schema}>
  {#snippet board(run)}
    <Board {...run} />
  {/snippet}
</ColorGame>
