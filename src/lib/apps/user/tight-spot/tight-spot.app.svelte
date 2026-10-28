<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack, type Component } from "svelte";
  import { DriveSettings } from "./core/settings.svelte";
  import type { GameProps } from "./games/define";
  import parking from "./games/parking";

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily = untrack(() => daily_prop);

  const { storage } = get_app_context();
  const settings = new DriveSettings(storage);

  let Game = $state.raw<Component<GameProps> | null>(null);

  $effect(() => {
    let live = true;
    void parking.load().then((module) => {
      if (live) Game = module.default;
    });
    return () => {
      live = false;
    };
  });
</script>

{#if Game}
  <Game {settings} {daily} />
{/if}
