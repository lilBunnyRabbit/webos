<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Signature } from "./stroke";

  const { signature, color, class: class_name }: { signature: Signature; color?: string; class?: string } = $props();
</script>

<svg
  viewBox="{signature.x} {signature.y} {signature.width} {signature.height}"
  preserveAspectRatio="xMidYMid meet"
  aria-hidden="true"
  class={cn("block", !color && "fill-foreground", class_name)}
>
  <path d={signature.d} fill={color} />
</svg>
