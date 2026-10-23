<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";

  type Props = Omit<HTMLInputAttributes, "type" | "size" | "value"> & { value?: number; size?: "sm" | "md" };

  let { value = $bindable(), size = "md", min = 0, max = 100, class: class_name, ...rest }: Props = $props();

  const fill = $derived.by(() => {
    const low = Number(min);
    const span = Number(max) - low;
    return span > 0 ? Math.min(1, Math.max(0, (Number(value ?? low) - low) / span)) : 0;
  });
</script>

<!-- Native range input: keyboard, ARIA and pointer handling stay the platform's; only the track and thumb are drawn. -->
<input
  type="range"
  bind:value
  {min}
  {max}
  style:--fill="{fill * 100}%"
  class={cn(
    "ui-slider min-w-0 cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-38",
    size === "sm" ? "h-7 pointer-coarse:h-9" : "h-8 pointer-coarse:h-10",
    class_name as string
  )}
  {...rest}
/>

<style>
  .ui-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(to right, var(--primary) var(--fill), color-mix(in oklch, var(--edge-control) 55%, transparent) var(--fill));
    box-shadow: var(--shadow-track);
  }

  .ui-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 9999px;
    background: var(--foreground);
    box-shadow: var(--shadow-raised);
    transition: scale 150ms var(--ease-out);
  }

  .ui-slider:hover:not(:disabled)::-webkit-slider-thumb,
  .ui-slider:active:not(:disabled)::-webkit-slider-thumb {
    scale: 1.15;
  }

  .ui-slider::-moz-range-track {
    height: 4px;
    border-radius: 9999px;
    background: color-mix(in oklch, var(--edge-control) 55%, transparent);
    box-shadow: var(--shadow-track);
  }

  .ui-slider::-moz-range-progress {
    height: 4px;
    border-radius: 9999px;
    background: var(--primary);
  }

  .ui-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 9999px;
    background: var(--foreground);
    box-shadow: var(--shadow-raised);
  }

  @media (pointer: coarse) {
    .ui-slider::-webkit-slider-thumb {
      width: 20px;
      height: 20px;
      margin-top: -8px;
    }

    .ui-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
    }
  }
</style>
