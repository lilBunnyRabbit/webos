<script lang="ts">
  import Board from "./board.svelte";
  import ColorGame from "./color-game.svelte";
  import { Level, Mode } from "./modes";
  import { recall_state_schema } from "./recall";
  import type { Seed } from "./seed";

  let { seed, daily, level }: { seed?: Seed; daily?: string; level?: Level } = $props();
</script>

<ColorGame
  mode={Mode.RECALL}
  {seed}
  {daily}
  {level}
  levels={{ [Level.EASY]: "Easy 5 s", [Level.HARD]: "Hard 2 s" }}
  keys="Arrows adjust a slider · Enter locks in"
  schema={recall_state_schema}
>
  {#snippet board(run)}
    <Board {...run} />
  {/snippet}
</ColorGame>
