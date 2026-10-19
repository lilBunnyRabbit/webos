<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { SWATCH } from "./colors";
  import { initial, type CardColor } from "./data";

  let { name, color, class: class_name }: { name: string; color: CardColor; class?: string } = $props();
</script>

<span aria-hidden="true" class={cn("grid shrink-0 place-items-center rounded-lg font-semibold text-background", SWATCH[color], class_name)}>
  {initial(name)}
</span>
