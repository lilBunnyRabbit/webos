<script lang="ts">
  import type { Snippet } from "svelte";
  import { badge, type BadgeVariants } from "./variants";

  interface Props extends BadgeVariants {
    class?: string;
    children: Snippet;
  }

  let { tone, class: class_name, children }: Props = $props();
</script>

<span class={badge({ tone, class: class_name })}>{@render children()}</span>
