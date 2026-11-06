<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Snippet } from "svelte";

  interface Props {
    side: boolean;
    width?: number;
    height?: number;
    children: Snippet;
  }

  let { side, width = $bindable(0), height = $bindable(0), children }: Props = $props();
</script>

<!-- Cards sit at the bottom or on the left instead of covering the board, so the bay, the car and where it touched stay in sight. -->
<div bind:clientWidth={width} bind:clientHeight={height} class={cn("ts-card", side && "ts-card-side")} aria-live="polite">
  {@render children()}
</div>

<style>
  .ts-card {
    position: absolute;
    inset-inline: 0.5rem;
    bottom: 0.5rem;
    margin-inline: auto;
    max-width: 30rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 1rem;
    row-gap: 0.5rem;
    padding: 0.75rem;
    border-radius: var(--radius-xl);
    background: color-mix(in oklch, var(--background) 92%, transparent);
    box-shadow: var(--shadow-popover);
    backdrop-filter: blur(2px);
    animation: var(--animate-pop-in);
  }

  .ts-card-side {
    inset-inline: 0.75rem auto;
    inset-block: 0.75rem;
    width: min(19rem, 45%);
    height: fit-content;
    max-height: calc(100% - 1.5rem);
    margin: auto 0;
    overflow-y: auto;
  }
</style>
