<script lang="ts">
  import kernel, { type DesktopItem, type MobileDesktopService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { background_menu } from "../desktop/desktop-actions";
  import HomeIcon from "./home-icon.svelte";
  import { home_item_menu } from "./home-actions";
  import { long_press } from "$lib/core/utils/long-press";

  let { ondrawer }: { ondrawer: () => void } = $props();

  const desktop = $derived(kernel.service<MobileDesktopService>("desktop"));

  /** A cell is a little wider than the 56px tile plus its two-line label; tablets just fit more of them. */
  const CELL_WIDTH = 88;
  const CELL_HEIGHT = 104;
  const MIN_COLUMNS = 4;
  const MAX_COLUMNS = 8;

  let size = $state({ width: 0, height: 0 });
  const columns = $derived(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(size.width / CELL_WIDTH))));
  const rows = $derived(Math.max(1, Math.floor(size.height / CELL_HEIGHT)));
  const pages = $derived(desktop.pages(size.width > 0 ? columns * rows : 0));
  const dock = $derived(desktop.dock());

  let scroller: HTMLElement | null = $state(null);
  let page = $state(0);

  function go_to(index: number) {
    if (!scroller) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    scroller.scrollTo({ left: clamped * scroller.clientWidth, behavior: "smooth" });
  }

  // Long press only opens the menu: dragging icons failed on Samsung Internet and is out until revisited.
  const item_menu = (item: DesktopItem, docked: boolean) =>
    long_press({ on_menu: (point) => home_item_menu(item, docked, point) });
</script>

<div class="flex h-full flex-col pt-[env(safe-area-inset-top)] select-none [-webkit-touch-callout:none]">
  <!-- Pages scroll natively (scroll snap); overscroll-x-contain keeps a fling at the last page from becoming browser back. -->
  <div
    bind:this={scroller}
    bind:clientWidth={size.width}
    bind:clientHeight={size.height}
    {@attach long_press({ on_menu: (point) => background_menu(point), ignore: "[data-home-name]" })}
    onscroll={(event) => {
      const element = event.currentTarget;
      page = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
    }}
    class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]"
    aria-label="Home screen"
  >
    {#each pages as items, index (index)}
      <div
        data-home-page={index}
        class="grid h-full w-full shrink-0 snap-start content-start px-2 pt-4"
        style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
        style:grid-auto-rows="{CELL_HEIGHT}px"
        aria-label="Page {index + 1} of {pages.length}"
      >
        {#each items as item (item.name)}
          <button
            data-home-name={item.name}
            {@attach item_menu(item, false)}
            onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
            class="flex flex-col items-center gap-1.5 rounded-2xl px-1 pt-2 active:bg-foreground/6"
          >
            <HomeIcon {item} />
          </button>
        {/each}
      </div>
    {/each}
  </div>

  {#if pages.length > 1}
    <div class="flex justify-center gap-1.5 py-2" role="tablist" aria-label="Pages">
      {#each pages as _, index (index)}
        <button
          role="tab"
          aria-selected={index === page}
          aria-label="Page {index + 1}"
          class={cn("h-1.5 rounded-full transition-all duration-200", index === page ? "w-4 bg-primary" : "w-1.5 bg-foreground/30")}
          onclick={() => go_to(index)}
        ></button>
      {/each}
    </div>
  {/if}

  <div class="px-2 pb-2">
    <nav
      data-dock
      aria-label="Dock"
      class="mx-auto flex w-fit max-w-full items-center gap-1 rounded-2xl bg-background-light/90 p-1.5 shadow-popover backdrop-blur-xl"
    >
      <button
        class="grid size-14 place-items-center rounded-2xl text-foreground/80 active:bg-foreground/10"
        aria-label="All apps"
        onclick={ondrawer}
      >
        <SquaresFourIcon class="size-7" weight="duotone" />
      </button>

      <div role="separator" class="mx-0.5 h-8 w-px shrink-0 bg-foreground/12"></div>

      {#each dock as item (item.name)}
        <button
          data-dock-name={item.name}
          {@attach item_menu(item, true)}
          onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
          class="rounded-2xl"
        >
          <HomeIcon {item} label={false} class="shadow-none" />
        </button>
      {:else}
        <p class="max-w-40 px-2 text-2xs leading-tight text-foreground/80">Hold an icon, then Add to dock</p>
      {/each}
    </nav>
  </div>
</div>

