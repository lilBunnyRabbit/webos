<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { COLOR_TILE, ICON } from "./colors";
  import { ListIcon, type ListMeta } from "./data";

  let { list, size = "md", class: class_name }: { list: Pick<ListMeta, "color" | "icon">; size?: "sm" | "md" | "lg"; class?: string } = $props();

  const Icon = $derived(ICON[list.icon ?? ListIcon.CART]);
</script>

<span
  class={cn(
    "grid shrink-0 place-items-center",
    COLOR_TILE[list.color],
    size === "sm" ? "size-5 rounded-md" : size === "md" ? "size-8 rounded-lg" : "size-11 rounded-xl",
    class_name
  )}
  aria-hidden="true"
>
  <Icon weight="fill" class={size === "sm" ? "size-3.5" : size === "md" ? "size-4.5" : "size-6"} />
</span>
