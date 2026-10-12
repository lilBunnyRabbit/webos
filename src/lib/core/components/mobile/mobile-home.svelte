<script lang="ts">
  import kernel, { type DesktopItem, type MobileDesktopService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
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
  /** Holding a dragged icon this close to the side of the screen turns the page. Inset from the device's edge zone. */
  const TURN_ZONE = 56;
  const TURN_DELAY = 550;

  let size = $state({ width: 0, height: 0 });
  const columns = $derived(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(size.width / CELL_WIDTH))));
  const rows = $derived(Math.max(1, Math.floor(size.height / CELL_HEIGHT)));
  const pages = $derived(desktop.pages(size.width > 0 ? columns * rows : 0));
  const dock = $derived(desktop.dock());

  let scroller: HTMLElement | null = $state(null);
  let page = $state(0);

  type Target = { zone: "home"; before: string | null } | { zone: "dock" };
  let drag = $state<{ item: DesktopItem; docked: boolean; point: Position; target: Target | null } | null>(null);
  let turn_timer: ReturnType<typeof setTimeout> | undefined;

  function go_to(index: number) {
    if (!scroller) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    scroller.scrollTo({ left: clamped * scroller.clientWidth, behavior: "smooth" });
  }

  function target_at(point: Position): Target | null {
    if (!drag) return null;
    const element = document.elementFromPoint(point.x, point.y);
    if (!element) return null;

    if (element.closest("[data-dock]")) return drag.docked || desktop.dock_full ? null : { zone: "dock" };

    const icon = element.closest<HTMLElement>("[data-home-name]");
    if (icon) {
      const name = icon.dataset.homeName!;
      return name === drag.item.name ? null : { zone: "home", before: name };
    }

    // Empty space on a page: the end of that page, which is just before the next page's first icon.
    const page_element = element.closest<HTMLElement>("[data-home-page]");
    if (page_element) {
      const index = Number(page_element.dataset.homePage);
      return { zone: "home", before: pages[index + 1]?.[0]?.name ?? null };
    }
    return null;
  }

  function maybe_turn(point: Position) {
    const width = scroller?.clientWidth ?? 0;
    const direction = point.x < TURN_ZONE ? -1 : point.x > width - TURN_ZONE ? 1 : 0;
    if (direction === 0) {
      clearTimeout(turn_timer);
      turn_timer = undefined;
      return;
    }
    if (turn_timer !== undefined) return;
    turn_timer = setTimeout(() => {
      turn_timer = undefined;
      go_to(page + direction);
      // Keep turning while the finger stays in the zone.
      if (drag) maybe_turn(drag.point);
    }, TURN_DELAY);
  }

  function drag_handlers(item: DesktopItem, docked: boolean) {
    return long_press({
      on_menu: (point) => home_item_menu(item, docked, point),
      on_drag_start: (point) => {
        drag = { item, docked, point, target: null };
      },
      on_drag_move: (point) => {
        if (!drag) return;
        drag.point = point;
        drag.target = target_at(point);
        maybe_turn(point);
      },
      on_drag_end: () => {
        const finished = drag;
        drag = null;
        clearTimeout(turn_timer);
        turn_timer = undefined;
        if (!finished?.target) return;
        if (finished.target.zone === "dock") desktop.set_docked(finished.item.name, true);
        else desktop.move_item(finished.item.name, finished.target.before);
      },
      on_drag_cancel: () => {
        drag = null;
        clearTimeout(turn_timer);
        turn_timer = undefined;
      },
    });
  }

  const drop_before = $derived(drag?.target?.zone === "home" ? drag.target.before : undefined);
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
            {@attach drag_handlers(item, false)}
            onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
            class={cn(
              "relative flex flex-col items-center gap-1.5 rounded-2xl px-1 pt-2 transition-opacity duration-150 active:bg-foreground/6",
              drag?.item.name === item.name && "opacity-30",
              drop_before === item.name && "before:absolute before:top-3 before:-left-px before:h-12 before:w-0.5 before:rounded-full before:bg-primary"
            )}
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
      class={cn(
        "mx-auto flex w-fit max-w-full items-center gap-1 rounded-2xl bg-background-light/90 p-1.5 shadow-popover backdrop-blur-xl transition-[box-shadow,background-color] duration-150",
        drag?.target?.zone === "dock" && "bg-primary/10 ring-1 ring-primary/60"
      )}
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
          {@attach drag_handlers(item, true)}
          onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
          class={cn("rounded-2xl transition-opacity duration-150", drag?.item.name === item.name && "opacity-30")}
        >
          <HomeIcon {item} label={false} class="shadow-none" />
        </button>
      {:else}
        <p class="max-w-40 px-2 text-2xs leading-tight text-foreground/80">Hold an icon, then drag it here</p>
      {/each}
    </nav>
  </div>
</div>

{#if drag}
  <div class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 scale-110" style:left="{drag.point.x}px" style:top="{drag.point.y}px">
    <HomeIcon item={drag.item} label={false} class="shadow-popover" />
  </div>
{/if}
