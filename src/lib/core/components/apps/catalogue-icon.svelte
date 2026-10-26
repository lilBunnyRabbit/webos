<script lang="ts" module>
  import type { Component } from "svelte";

  export interface CatalogueIconSource {
    code: () => Component<Record<string, unknown>> | undefined;
    sprite: () => string | null;
    failed: () => boolean;
  }
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { code, sprite, failed, class: class_name, ...rest }: CatalogueIconSource & { class?: string; [key: string]: unknown } = $props();

  const Own = $derived(code());
  const href = $derived(Own ? null : sprite());
</script>

{#if Own}
  <Own class={class_name} {...rest} />
{:else if href}
  <svg class={class_name} aria-hidden="true"><use {href} width="100%" height="100%" /></svg>
{:else}
  <span class={cn("inline-block rounded-[28%] bg-foreground/12", !failed() && "motion-safe:animate-pulse", class_name)} aria-hidden="true"></span>
{/if}
