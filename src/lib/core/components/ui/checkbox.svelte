<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";

  type Props = Omit<HTMLInputAttributes, "type" | "checked"> & { checked?: boolean };

  let { checked = $bindable(false), class: class_name, ...rest }: Props = $props();
</script>

<input
  type="checkbox"
  bind:checked
  class={cn(
    "relative size-4 shrink-0 cursor-pointer appearance-none rounded-xs bg-field shadow-recessed transition-[background-color,box-shadow] duration-150",
    "checked:bg-primary checked:shadow-control checked:ring-0 checked:[--edge-lit:oklch(from_var(--primary)_calc(l+0.1)_c_h)]",
    "after:absolute after:top-[45%] after:left-1/2 after:h-2 after:w-1 after:-translate-1/2 after:rotate-45 after:border-r-2 after:border-b-2 after:border-background after:opacity-0 checked:after:opacity-100",
    "disabled:cursor-default disabled:opacity-38",
    class_name as string
  )}
  {...rest}
/>
