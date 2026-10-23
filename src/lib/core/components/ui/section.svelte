<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";
  import { TARGETED_SECTION } from "./setting-anchor";

  interface Props {
    title?: string;
    description?: string;
    actions?: Snippet;
    /** Content without the card around it. */
    flush?: boolean;
    /** An id search and deep links land on (`reveal_setting`). */
    setting?: string;
    class?: string;
    children: Snippet;
  }

  /** A titled group on an app's surface: heading, optional description, then content in a raised card. */
  let {
    title,
    description,
    actions,
    flush = false,
    setting,
    class: class_name,
    children,
  }: Props = $props();
</script>

<section data-setting={setting} class={cn("flex flex-col gap-2.5 rounded-xl transition-[outline-color] duration-500", TARGETED_SECTION, class_name)}>
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
    <div class="divide-y divide-hairline rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
      {@render children()}
    </div>
  {/if}
</section>
