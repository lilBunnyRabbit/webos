<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { to_hex, type Color } from "./color";

  interface Props {
    color: Color;
    label: string;
    onclick?: () => void;
    class?: string;
  }

  let { color, label, onclick, class: class_name }: Props = $props();

  const hex = $derived(to_hex(color));
</script>

{#if onclick}
  <button
    type="button"
    title={label}
    aria-label={label}
    class={cn(
      "swatch block overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail active:scale-100",
      class_name
    )}
    {onclick}
  >
    <span class="block size-full" style:background-color={hex}></span>
  </button>
{:else}
  <span role="img" aria-label={label} class={cn("swatch block overflow-hidden rounded-lg ring-1 ring-foreground/10", class_name)}>
    <span class="block size-full" style:background-color={hex}></span>
  </span>
{/if}

<style>
  .swatch {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 12%, transparent) 0 25%, transparent 0 50%) 0 0 / 12px 12px;
  }
</style>
