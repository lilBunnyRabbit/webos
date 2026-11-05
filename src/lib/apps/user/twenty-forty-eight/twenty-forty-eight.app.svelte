<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import GameScreen from "./game-screen.svelte";
  import { empty_storage, storage_schema } from "./game";

  const { storage } = get_app_context();
  const data = storage.file("storage.json", empty_storage(), storage_schema);
</script>

<!-- The saved game seeds the board once, so the board waits for the file instead of dealing a fresh one first. -->
{#if data.ready}
  <GameScreen />
{/if}
