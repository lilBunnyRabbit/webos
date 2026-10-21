<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  interface Props {
    title: string;
    detail?: string;
    class?: string;
    children?: Snippet;
  }

  let {
    title,
    detail,
    class: class_name,
    children,
  }: Props = $props();
</script>

<div
  class={cn(
    "absolute inset-0 grid animate-in place-items-center rounded-[inherit] bg-background/80 p-4 text-center backdrop-blur-[2px] fade-in",
    class_name
  )}
  aria-live="polite"
>
  <div class="flex flex-col items-center gap-3">
    <p class="text-base font-semibold">{title}</p>
    {#if detail}<p class="font-mono text-2xs text-foreground/80 tabular-nums">{detail}</p>{/if}
    {#if children}<div class="flex flex-wrap justify-center gap-2">{@render children()}</div>{/if}
  </div>
</div>
