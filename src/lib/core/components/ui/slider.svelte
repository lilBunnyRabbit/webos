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
  /* A groove sunk into the surface, filled with a softened primary; the knob is the panel colour, raised, with a primary dot. */
  .ui-slider {
    --well: light-dark(color-mix(in oklch, var(--background), var(--background-dark)), var(--background-darker));
    --knob: radial-gradient(circle, var(--primary) 0 3px, var(--background-lighter) 3.5px);
    --knob-shadow: var(--shadow-control), 0 0 0 1px var(--hairline);
  }

  .ui-slider::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 9999px;
    background: linear-gradient(to right, color-mix(in oklch, var(--primary) 85%, var(--well)) var(--fill), var(--well) var(--fill));
    box-shadow: var(--shadow-track);
  }

  .ui-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    margin-top: -5px;
    border-radius: 9999px;
    background: var(--knob);
    box-shadow: var(--knob-shadow);
    transition: scale 150ms var(--ease-out);
  }

  .ui-slider:hover:not(:disabled)::-webkit-slider-thumb,
  .ui-slider:active:not(:disabled)::-webkit-slider-thumb {
    scale: 1.1;
  }

  .ui-slider::-moz-range-track {
    height: 8px;
    border-radius: 9999px;
    background: var(--well);
    box-shadow: var(--shadow-track);
  }

  .ui-slider::-moz-range-progress {
    height: 8px;
    border-radius: 9999px;
    background: color-mix(in oklch, var(--primary) 85%, var(--well));
  }

  .ui-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 9999px;
    background: var(--knob);
    box-shadow: var(--knob-shadow);
  }

  @media (pointer: coarse) {
    .ui-slider::-webkit-slider-thumb {
      width: 24px;
      height: 24px;
      margin-top: -8px;
    }

    .ui-slider::-moz-range-thumb {
      width: 24px;
      height: 24px;
    }
  }
</style>
