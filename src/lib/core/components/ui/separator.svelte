<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    vertical?: boolean;
    class?: string;
  }

  let { vertical = false, class: class_name }: Props = $props();
</script>

<div role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} class={cn("shrink-0 bg-foreground/10", vertical ? "mx-1 h-4 w-px" : "h-px w-full", class_name)}></div>
