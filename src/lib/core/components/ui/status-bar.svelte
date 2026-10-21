<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  interface Props {
    class?: string;
    children: Snippet;
  }

  /** Footer metadata row: quiet, monospaced values, never actions that matter. */
  let { class: class_name, children }: Props = $props();
</script>

<div class={cn("flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t border-foreground/8 bg-background-light px-3 font-mono text-2xs whitespace-nowrap text-foreground/80 [&>*]:truncate", class_name)}>
  {@render children()}
</div>
