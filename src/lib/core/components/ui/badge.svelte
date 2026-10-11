<script lang="ts">
  import type { Snippet } from "svelte";
  import { badge, type BadgeVariants } from "./variants";

  let { tone, class: class_name, children }: BadgeVariants & { class?: string; children: Snippet } = $props();
</script>

<span class={badge({ tone, class: class_name })}>{@render children()}</span>
