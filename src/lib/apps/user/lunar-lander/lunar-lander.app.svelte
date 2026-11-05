<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { empty_stored, stored_schema } from "./game";
  import Play from "./play.svelte";

  const { storage } = get_app_context();
  // The saved ship and environment build the first game, so nothing renders until the file is read.
  const store = storage.file("storage.json", empty_stored(), stored_schema);
</script>

{#if store.ready}
  <Play />
{/if}
