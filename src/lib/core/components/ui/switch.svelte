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
    "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-foreground/15 shadow-recessed ring-1 ring-inset ring-foreground/45 transition-colors duration-150 checked:ring-0",
    "before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-foreground before:shadow-raised before:transition-[translate] before:duration-150 before:ease-out",
    "checked:bg-primary checked:before:translate-x-4 checked:before:bg-background",
    "disabled:cursor-default disabled:opacity-38",
    class_name as string
  )}
  {...rest}
/>
