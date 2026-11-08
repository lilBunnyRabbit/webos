<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  interface Props {
    class?: string;
    children: Snippet;
  }

  /** An app's top bar: controls on the chrome shade, separated from content by a hairline. Wraps when a phone is too narrow. Its right end clears an immersive window's exit button (ADR-101). */
  let { class: class_name, children }: Props = $props();
</script>

<div role="toolbar" class={cn("flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 py-1.5 border-b border-foreground/8 bg-background-light pl-2 pr-[calc(0.5rem+var(--immersive-inset-right,0px))]", class_name)}>
  {@render children()}
</div>
