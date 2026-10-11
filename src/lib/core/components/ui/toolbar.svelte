<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  /** An app's top bar: one row of controls on the chrome shade, separated from content by a hairline. */
  let { class: class_name, children }: { class?: string; children: Snippet } = $props();
</script>

<div role="toolbar" class={cn("flex h-11 shrink-0 items-center gap-1.5 border-b border-foreground/8 bg-background-light px-2", class_name)}>
  {@render children()}
</div>
