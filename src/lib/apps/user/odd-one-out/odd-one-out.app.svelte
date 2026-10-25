<script lang="ts">
  import ColorGame from "../color-recall/color-game.svelte";
  import { Mode } from "../color-recall/modes";
  import type { Seed } from "../color-recall/seed";
  import Board from "./board.svelte";
  import { odd_state_schema } from "./odd";

  let { seed, daily }: { seed?: Seed; daily?: string } = $props();
</script>

<ColorGame mode={Mode.ODD} {seed} {daily} keys="Arrows move · Enter picks" schema={odd_state_schema}>
  {#snippet board(run)}
    <Board {...run} />
  {/snippet}
</ColorGame>
