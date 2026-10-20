<script lang="ts">
  import kernel, { type LiveWallpaperId, type SettingsService } from "$lib/core/api";
  import { untrack } from "svelte";
  import { LIVE_WALLPAPERS, live_options_of, type LiveLayer } from "./registry";
  import { LiveContextState } from "./context.svelte";

  interface Props {
    id: LiveWallpaperId;
    layer: LiveLayer;
    /** A Settings thumbnail: a still frame, no listeners. */
    preview?: boolean;
  }

  let { id, layer, preview = false }: Props = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const entry = $derived(LIVE_WALLPAPERS[id]);
  const load = $derived(layer === "overlay" ? entry?.overlay : entry?.background);
  const options = $derived(live_options_of(id, settings.live_options[id]));

  let host = $state<HTMLElement | null>(null);
  const context = new LiveContextState(
    untrack(() => preview),
    () => host
  );

  $effect(() => {
    if (host) return context.attach();
  });
</script>

<div bind:this={host} class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
  {#if load}
    {#await load() then { default: Live }}
      <Live {context} {options} />
    {/await}
  {/if}
</div>
