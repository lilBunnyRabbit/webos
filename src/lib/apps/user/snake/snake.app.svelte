<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import GameScreen from "./game-screen.svelte";
  import { empty_storage, storage_schema } from "./game";

  const { storage } = get_app_context();
  const data = storage.file("storage.json", empty_storage(), storage_schema);
</script>

<!-- The first game is laid out from the saved speed and walls, so it waits for the file instead of starting on the defaults. -->
{#if data.ready}
  <GameScreen />
{/if}
