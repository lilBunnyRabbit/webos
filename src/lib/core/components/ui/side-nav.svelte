<script lang="ts" generics="T extends string">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "./types";

  interface Item {
    value: T;
    label: string;
    icon: IconComponent;
    count?: number;
  }

  /**
   * An app's section navigation: a sidebar in wide windows, a scrolling row of tabs in narrow ones. Needs an
   * `@container` ancestor (window content provides one).
   */
  let nav: HTMLElement | null = $state(null);

  // In the narrow tab row the active tab can sit off-screen; bring it into view whenever it changes.
  $effect(() => {
    void value;
    nav?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  let {
    value = $bindable(),
    items,
    label,
    footer,
  }: { value: T; items: Item[]; label: string; footer?: Snippet } = $props();
</script>

<nav
  bind:this={nav}
  aria-label={label}
  class="flex shrink-0 gap-1 overflow-x-auto border-b border-foreground/8 bg-background-light p-1.5 @2xl:w-52 @2xl:flex-col @2xl:overflow-x-visible @2xl:border-r @2xl:border-b-0 @2xl:p-2"
>
  {#each items as item (item.value)}
    {@const active = item.value === value}
    <button
      aria-current={active ? "page" : undefined}
      class={cn(
        "flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium transition-colors duration-150",
        active ? "bg-foreground/10 text-foreground" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
      )}
      onclick={() => (value = item.value)}
    >
      <item.icon class={cn("size-4", active && "text-primary")} weight={active ? "fill" : "regular"} />
      {item.label}
      {#if item.count !== undefined}
        <span class={cn("ml-auto pl-1 font-mono text-2xs tabular-nums", active ? "text-foreground/80" : "text-foreground/65")}>{item.count}</span>
      {/if}
    </button>
  {/each}

  {#if footer}
    <div class="ml-auto shrink-0 @2xl:mt-auto @2xl:ml-0">{@render footer()}</div>
  {/if}
</nav>
