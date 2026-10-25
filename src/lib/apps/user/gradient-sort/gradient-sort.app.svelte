<script lang="ts">
  import ColorGame from "../color-recall/color-game.svelte";
  import { Level, Mode } from "../color-recall/modes";
  import type { Seed } from "../color-recall/seed";
  import Board from "./board.svelte";
  import { sort_state_schema } from "./sort";

  let { seed, daily, level }: { seed?: Seed; daily?: string; level?: Level } = $props();
</script>

<ColorGame
  mode={Mode.SORT}
  {seed}
  {daily}
  {level}
  levels={{ [Level.EASY]: "Easy", [Level.HARD]: "Hard" }}
  keys="Arrows move · Enter picks, then swaps"
  schema={sort_state_schema}
>
  {#snippet board(run)}
    <Board {...run} />
  {/snippet}
</ColorGame>
