<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import GameScreen from "./game-screen.svelte";
  import { empty_storage, storage_schema } from "./board";

  const { path }: { path?: string } = $props();
  const { storage } = get_app_context();
  const data = storage.file("storage.json", empty_storage(), storage_schema);
</script>

<!-- The saved game reopens once at start, so the table waits for the file instead of starting empty first. -->
{#if data.ready}
  <GameScreen {path} />
{/if}
