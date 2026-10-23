<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";

  type Props = Omit<HTMLInputAttributes, "type" | "checked"> & { checked?: boolean };

  let { checked = $bindable(false), class: class_name, ...rest }: Props = $props();
</script>

<!-- A native checkbox with switch semantics, so forms, labels and keyboard work without extra code. -->
<input
  type="checkbox"
  role="switch"
  bind:checked
  class={cn(
    "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-field shadow-recessed ring-1 ring-inset ring-transparent hover:ring-edge transition-[background-color,box-shadow] duration-150 checked:ring-0",
    "before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-background-lighter before:shadow-[var(--shadow-control),0_0_0_1px_var(--hairline)] before:transition-[translate] before:duration-150 before:ease-out",
    "checked:bg-[color-mix(in_oklch,var(--primary)_85%,var(--color-field))] checked:before:translate-x-4",
    "disabled:cursor-default disabled:opacity-38",
    class_name as string
  )}
  {...rest}
/>
