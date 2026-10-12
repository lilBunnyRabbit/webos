<script lang="ts">
  import type { Snippet } from "svelte";

  /** A square frame with corner brackets. `scanning` sweeps a line over it, for the camera. */
  let { scanning = false, children }: { scanning?: boolean; children: Snippet } = $props();
</script>

<div class="relative mx-auto aspect-square w-full max-w-64 p-2.5">
  {#each ["top-0 left-0 border-t-2 border-l-2 rounded-tl-lg", "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg", "right-0 bottom-0 border-r-2 border-b-2 rounded-br-lg"] as corner (corner)}
    <span class="pointer-events-none absolute size-6 border-primary {corner}"></span>
  {/each}
  <div class="relative size-full overflow-hidden rounded-md">
    {@render children()}
    {#if scanning}
      <span class="scan-line pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary shadow-[0_0_12px_2px_var(--primary)]"></span>
    {/if}
  </div>
</div>

<style>
  .scan-line {
    animation: scan 2.4s ease-in-out infinite alternate;
  }

  @keyframes scan {
    to {
      top: calc(100% - 2px);
    }
  }
</style>
