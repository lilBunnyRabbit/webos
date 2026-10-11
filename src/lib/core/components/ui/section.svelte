<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  /** A titled group on an app's surface: heading, optional description, then content in a raised card. */
  let {
    title,
    description,
    actions,
    flush = false,
    class: class_name,
    children,
  }: {
    title?: string;
    description?: string;
    actions?: Snippet;
    /** Content without the card around it. */
    flush?: boolean;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<section class={cn("flex flex-col gap-2.5", class_name)}>
  {#if title || actions}
    <header class="flex items-end justify-between gap-4 px-0.5">
      <div class="min-w-0">
        {#if title}<h2 class="text-sm font-semibold">{title}</h2>{/if}
        {#if description}<p class="text-ui text-foreground/65">{description}</p>{/if}
      </div>
      {#if actions}<div class="flex shrink-0 items-center gap-1.5">{@render actions()}</div>{/if}
    </header>
  {/if}

  {#if flush}
    {@render children()}
  {:else}
    <div class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
      {@render children()}
    </div>
  {/if}
</section>
