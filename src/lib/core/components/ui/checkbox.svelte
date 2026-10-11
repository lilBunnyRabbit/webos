<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";

  type Props = Omit<HTMLInputAttributes, "type" | "checked"> & { checked?: boolean };

  let { checked = $bindable(false), class: class_name, ...rest }: Props = $props();
</script>

<input
  type="checkbox"
  bind:checked
  class={cn("size-4 shrink-0 cursor-pointer rounded-xs accent-primary disabled:cursor-default disabled:opacity-38", class_name as string)}
  {...rest}
/>
