<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import GameScreen from "./game-screen.svelte";
  import { empty_storage, storage_schema } from "./options";

  const { storage } = get_app_context();
  const data = storage.file("storage.json", empty_storage(), storage_schema);
</script>

<!-- The first maze is carved from the saved picks, so it waits for the file instead of carving the defaults first. -->
{#if data.ready}
  <GameScreen />
{/if}
