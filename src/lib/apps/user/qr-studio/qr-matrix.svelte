<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Snippet } from "svelte";
  import { module_path } from "./render";

  interface Layer {
    pick: (index: number) => boolean;
    class: string;
  }

  let {
    size,
    layers,
    label,
    quiet = 1,
    class: class_name,
    children,
  }: { size: number; layers: Layer[]; label: string; quiet?: number; class?: string; children?: Snippet } = $props();

  const side = $derived(size + quiet * 2);
  const paths = $derived(layers.map((layer) => ({ d: module_path(size, layer.pick, quiet), class: layer.class })));
</script>

<svg viewBox="0 0 {side} {side}" shape-rendering="crispEdges" class={cn("block aspect-square w-full rounded-md", class_name)} role="img" aria-label={label}>
  <rect width={side} height={side} class="fill-[light-dark(var(--background-lightest),var(--background-darker))]" />
  {#each paths as path, i (i)}
    <path d={path.d} class={path.class} />
  {/each}
  <g transform="translate({quiet} {quiet})">{@render children?.()}</g>
</svg>
