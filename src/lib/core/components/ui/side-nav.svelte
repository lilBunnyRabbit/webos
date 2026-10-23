<script lang="ts" generics="T extends string">
  import { tick, type Snippet } from "svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import Button from "./button.svelte";
  import type { IconComponent } from "./types";

  interface Item {
    value: T;
    label: string;
    icon: IconComponent;
    count?: number;
    /** Items sharing a group sit under its overline in the sidebar and the drill-in list. Keep a group's items together. */
    group?: string;
  }

  interface Props {
    value: T;
    items: Item[];
    label: string;
    footer?: Snippet;
    header?: Snippet;
    /** Replaces the items while set: search results. */
    list?: Snippet;
    /**
     * The page. Passing it turns on drill-in: the nav and the page sit side by side from `@2xl`, and below that one
     * shows at a time, the list first. Picking an item opens its page; Back (the button above the page, or the phone's
     * Back through `window.on_back`) returns to the list. Needs a window (app context).
     */
    children?: Snippet;
    open?: boolean;
    back_label?: string;
    /** Drill-in: a step back inside the page (leaving a subpage), tried before the list. `true` when it took it. */
    onback?: () => boolean;
  }

  /**
   * An app's section navigation: a sidebar in wide windows, a scrolling row of tabs in narrow ones, or, given the page
   * as `children`, a drill-in list. Needs an `@container` ancestor (window content provides one).
   */
  let {
    value = $bindable(),
    items,
    label,
    footer,
    header,
    list,
    children,
    open = $bindable(false),
    back_label = "Back",
    onback,
  }: Props = $props();

  let nav: HTMLElement | null = $state(null);
  let bar: HTMLElement | null = $state(null);

  // svelte-ignore state_referenced_locally
  const drill = children !== undefined;
  const win = drill ? get_app_context().window : null;

  // In the narrow tab row the active tab can sit off-screen; bring it into view whenever it changes.
  $effect(() => {
    void value;
    if (!drill) nav?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  $effect(() => {
    if (!win) return;
    return win.on_back(() => {
      if (onback?.()) return true;
      if (!open || !bar?.checkVisibility()) return false;
      void back();
      return true;
    });
  });

  // Focus follows the drill, so a keyboard user isn't left on a list that just went away.
  async function pick(item: Item) {
    value = item.value;
    if (!drill) return;
    const narrow = nav !== null && bar !== null && !open && nav.checkVisibility() && !bar.checkVisibility();
    open = true;
    if (!narrow) return;
    await tick();
    bar?.querySelector<HTMLElement>("button")?.focus();
  }

  async function back() {
    open = false;
    await tick();
    nav?.querySelector<HTMLElement>("[aria-current=page]")?.focus();
  }
</script>

{#snippet navigation()}
  <nav
    bind:this={nav}
    aria-label={label}
    class={cn(
      "flex shrink-0 bg-background-light",
      drill
        ? cn(
            "min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3 @2xl:w-56 @2xl:flex-none @2xl:border-r @2xl:border-hairline @2xl:p-2",
            open && "hidden @2xl:flex"
          )
        : "gap-1 overflow-x-auto border-b border-hairline p-1.5 @2xl:w-52 @2xl:flex-col @2xl:overflow-x-visible @2xl:border-r @2xl:border-b-0 @2xl:p-2"
    )}
  >
    {#if header}<div class="mb-1 shrink-0">{@render header()}</div>{/if}

    {#if list}
      {@render list()}
    {:else}
      {#each items as item, index (item.value)}
        {@const active = item.value === value}
        {#if item.group && item.group !== items[index - 1]?.group}
          <p class={cn("shrink-0 px-2.5 pt-3 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase @2xl:pt-2.5", !drill && "hidden @2xl:block")}>
            {item.group}
          </p>
        {/if}
        <button
          aria-current={active ? "page" : undefined}
          class={cn(
            "flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium transition-colors duration-150",
            drill && "h-11 pointer-coarse:h-11 @2xl:h-8 @2xl:pointer-coarse:h-10",
            active ? "bg-foreground/10 text-foreground" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
          )}
          onclick={() => pick(item)}
        >
          <item.icon class={cn("size-4", active && "text-primary")} weight={active ? "fill" : "regular"} />
          {item.label}
          {#if item.count !== undefined}
            <span class={cn("ml-auto pl-1 font-mono text-2xs tabular-nums", active ? "text-foreground/80" : "text-foreground/65")}>{item.count}</span>
          {/if}
          {#if drill}<CaretRightIcon class={cn("size-3.5 text-foreground/65 @2xl:hidden", item.count === undefined && "ml-auto")} weight="bold" />{/if}
        </button>
      {/each}
    {/if}

    {#if footer}
      <div class={cn("shrink-0", drill ? "mt-auto pt-2" : "ml-auto @2xl:mt-auto @2xl:ml-0")}>{@render footer()}</div>
    {/if}
  </nav>
{/snippet}

{#if children}
  <div class="flex h-full min-h-0 flex-col @2xl:flex-row">
    {@render navigation()}
    <div class={cn("min-h-0 min-w-0 flex-1 flex-col", open ? "flex" : "hidden @2xl:flex")}>
      <div bind:this={bar} class="flex shrink-0 items-center border-b border-hairline bg-background-light p-1.5 @2xl:hidden">
        <Button variant="quiet" size="sm" onclick={back}><CaretLeftIcon weight="bold" />{back_label}</Button>
      </div>
      {@render children()}
    </div>
  </div>
{:else}
  {@render navigation()}
{/if}
