<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import GameScreen from "./game-screen.svelte";
  import { empty_storage, storage_schema } from "./game";

  const { daily }: { daily?: string } = $props();
  const { storage } = get_app_context();
  const data = storage.file("storage.json", empty_storage(), storage_schema);
</script>

<!-- The board is laid out once from the saved difficulty, so it waits for the file instead of dealing Beginner first. -->
{#if data.ready}
  <GameScreen {daily} />
{/if}
