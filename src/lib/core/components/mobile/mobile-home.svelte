<script lang="ts">
  import kernel, { type AppsService, type DesktopItem, type HomeSlot, type MobileDesktopService, type UiService } from "$lib/core/api";
  import { UiOverlay } from "$lib/core/api/services/ui/type";
  import type { WidgetSize } from "$lib/core/api/services/apps/type";
  import { clamp_widget_size } from "$lib/core/api/services/apps/widget";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { Plus as PlusIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { background_menu } from "../desktop/desktop-actions";
  import WidgetBody from "../desktop/widget-body.svelte";
  import { Button } from "../ui";
  import HomeIcon from "./home-icon.svelte";
  import { add_widget_menu, EDIT_HOME_ITEM, home_item_menu } from "./home-actions";
  import { long_press } from "$lib/core/utils/long-press";

  let { ondrawer }: { ondrawer: () => void } = $props();

  const desktop = $derived(kernel.service<MobileDesktopService>("desktop"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const ui = $derived(kernel.service<UiService>("ui"));

  /** A cell is a little wider than the 56px tile plus its two-line label; tablets just fit more of them. */
  const CELL_WIDTH = 88;
  const CELL_HEIGHT = 104;
  const MIN_COLUMNS = 4;
  const MAX_COLUMNS = 8;
  /** Holding a dragged item this close to the side of the screen turns the page. Inset from the device's edge zone. */
  const TURN_ZONE = 56;
  const TURN_DELAY = 550;
  const DRAG_SLOP = 8;

  let size = $state({ width: 0, height: 0 });
  const columns = $derived(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(size.width / CELL_WIDTH))));
  const rows = $derived(Math.max(1, Math.floor(size.height / CELL_HEIGHT)));
  const pages = $derived(size.width > 0 ? desktop.pages(columns, rows) : [[]]);
  const dock = $derived(desktop.dock());

  let scroller: HTMLElement | null = $state(null);
  let page = $state(0);

  function go_to(index: number) {
    if (!scroller) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    scroller.scrollTo({ left: clamped * scroller.clientWidth, behavior: "smooth" });
  }

  /**
   * Edit mode exists because a drag after a hold never started on Samsung Internet: until the hold fired the browser
   * owned the touch and claimed it as a scroll. Here items carry `touch-action: none` from the start, so the press is ours.
   * It lives in `ui` as an overlay so Back and Escape leave it.
   */
  const editing = $derived(ui.overlay === UiOverlay.HOME_EDIT);
  const edit = () => ui.open(UiOverlay.HOME_EDIT);

  // Leaving removes the grips under a held pointer, so their capture is never lost.
  $effect(() => {
    if (editing) return;
    drag_cancel();
    resize_cancel();
  });

  type Target = { zone: "home" | "dock"; before: string | null };
  interface Drag {
    item: DesktopItem;
    docked: boolean;
    start: Position;
    point: Position;
    moving: boolean;
    target: Target | null;
  }
  let drag = $state<Drag | null>(null);
  let turn_timer: ReturnType<typeof setTimeout> | undefined;

  interface Resize {
    name: string;
    start: Position;
    from: WidgetSize;
    size: WidgetSize;
    cell: { w: number; h: number };
    slot: HomeSlot;
  }
  let resize = $state<Resize | null>(null);

  const item_menu = (item: DesktopItem, docked: boolean) =>
    long_press({ on_menu: (point) => home_item_menu(item, docked, point, edit) });

  function stop_turning() {
    clearTimeout(turn_timer);
    turn_timer = undefined;
  }

  function target_at(point: Position): Target | null {
    if (!drag) return null;
    const element = document.elementFromPoint(point.x, point.y);
    if (!element) return null;

    if (element.closest("[data-dock]")) {
      if (drag.item.kind === "widget" || (!drag.docked && desktop.dock_full)) return null;
      const name = element.closest<HTMLElement>("[data-dock-name]")?.dataset.dockName ?? null;
      return name === drag.item.name ? null : { zone: "dock", before: name };
    }

    const slot = element.closest<HTMLElement>("[data-home-name]");
    if (slot) {
      const name = slot.dataset.homeName!;
      return name === drag.item.name ? null : { zone: "home", before: name };
    }

    const page_element = element.closest<HTMLElement>("[data-home-page]");
    if (page_element) {
      const index = Number(page_element.dataset.homePage);
      return { zone: "home", before: pages[index + 1]?.[0]?.item.name ?? null };
    }
    return null;
  }

  function maybe_turn(point: Position) {
    const width = scroller?.clientWidth ?? 0;
    const direction = point.x < TURN_ZONE ? -1 : point.x > width - TURN_ZONE ? 1 : 0;
    if (direction === 0) return stop_turning();
    if (turn_timer !== undefined) return;
    turn_timer = setTimeout(() => {
      turn_timer = undefined;
      go_to(page + direction);
      if (drag?.moving) maybe_turn(drag.point);
    }, TURN_DELAY);
  }

  function drag_start(event: PointerEvent, item: DesktopItem, docked: boolean) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    drag = { item, docked, start: point, point, moving: false, target: null };
  }

  function drag_move(event: PointerEvent) {
    if (!drag) return;
    drag.point = { x: event.clientX, y: event.clientY };
    if (!drag.moving && Math.hypot(drag.point.x - drag.start.x, drag.point.y - drag.start.y) <= DRAG_SLOP) return;
    drag.moving = true;
    drag.target = target_at(drag.point);
    maybe_turn(drag.point);
  }

  function drag_cancel() {
    drag = null;
    stop_turning();
  }

  /** Settles on pointer-up: a dropped item's element is often gone by the time its capture would be lost. */
  function drag_end() {
    const finished = drag;
    drag_cancel();
    if (!finished) return;
    if (!finished.moving) home_item_menu(finished.item, finished.docked, finished.point, edit);
    else if (finished.target?.zone === "dock") desktop.set_docked(finished.item.name, true, finished.target.before);
    else if (finished.target) desktop.move_item(finished.item.name, finished.target.before);
  }

  function resize_start(event: PointerEvent, slot: HomeSlot) {
    if (slot.item.kind !== "widget" || !event.isPrimary) return;
    event.stopPropagation();
    const frame = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-home-name]");
    if (!frame) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const rect = frame.getBoundingClientRect();
    resize = {
      name: slot.item.name,
      start: { x: event.clientX, y: event.clientY },
      from: slot.size,
      size: slot.size,
      cell: { w: rect.width / slot.size.w, h: rect.height / slot.size.h },
      slot,
    };
  }

  function resize_move(event: PointerEvent) {
    if (!resize || resize.slot.item.kind !== "widget") return;
    const limits = apps.get(resize.slot.item.app_id)?.widget_size;
    const grown = {
      w: resize.from.w + Math.round((event.clientX - resize.start.x) / resize.cell.w),
      h: resize.from.h + Math.round((event.clientY - resize.start.y) / resize.cell.h),
    };
    const clamped = clamp_widget_size(grown, limits);
    resize.size = { w: Math.min(clamped.w, columns - resize.slot.x), h: Math.min(clamped.h, rows - resize.slot.y) };
  }

  function resize_cancel() {
    resize = null;
  }

  function resize_end() {
    const finished = resize;
    resize = null;
    if (!finished || (finished.size.w === finished.from.w && finished.size.h === finished.from.h)) return;
    void desktop.resize_widget(finished.name, finished.size);
  }

  function background(point: Position) {
    void background_menu(point, [
      { item: EDIT_HOME_ITEM, run: edit },
      { item: { id: "add_widget", label: "Add widget", icon: PlusIcon }, run: () => void add_widget_menu(point) },
    ]);
  }

  function on_key_down(event: KeyboardEvent) {
    if (event.key === "Escape" && (drag || resize)) event.preventDefault();
  }

  const resizable = (item: DesktopItem) => item.kind === "widget" && apps.get(item.app_id)?.widget_size !== undefined;
  const drop_before = $derived(drag?.moving && drag.target?.zone === "home" ? drag.target.before : undefined);
  const dock_before = $derived(drag?.moving && drag.target?.zone === "dock" ? drag.target.before : undefined);
</script>

<svelte:window onkeydowncapture={on_key_down} />

{#snippet edit_handlers(item: DesktopItem, docked: boolean)}
  <button
    type="button"
    aria-label="Move {item.kind === 'shortcut' || item.kind === 'widget' ? item.label : item.name}"
    class="absolute inset-0 z-10 cursor-grab touch-none rounded-2xl active:cursor-grabbing"
    onpointerdown={(event) => drag_start(event, item, docked)}
    onpointermove={drag_move}
    onpointerup={drag_end}
    onlostpointercapture={drag_cancel}
    oncontextmenu={(event) => event.preventDefault()}
  ></button>
{/snippet}

<div class="flex h-full flex-col pt-[env(safe-area-inset-top)] select-none [-webkit-touch-callout:none]">
  {#if editing}
    <div class="flex items-center justify-between gap-2 px-3 pt-2">
      <Button variant="secondary" size="sm" onclick={(event) => add_widget_menu({ x: event.clientX, y: event.clientY })}>
        <PlusIcon weight="bold" /> Add widget
      </Button>
      <Button size="sm" onclick={() => ui.close()}>Done</Button>
    </div>
  {/if}

  <!-- Pages scroll natively (scroll snap); overscroll-x-contain keeps a fling at the last page from becoming browser back. -->
  <div
    bind:this={scroller}
    bind:clientWidth={size.width}
    bind:clientHeight={size.height}
    {@attach long_press({ on_menu: background, ignore: "[data-home-name]" })}
    onscroll={(event) => {
      const element = event.currentTarget;
      page = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
    }}
    class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]"
    aria-label="Home screen"
  >
    {#each pages as slots, index (index)}
      <div
        data-home-page={index}
        class="grid h-full w-full shrink-0 snap-start content-start px-2 pt-4"
        style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
        style:grid-template-rows="repeat({rows}, {CELL_HEIGHT}px)"
        aria-label="Page {index + 1} of {pages.length}"
      >
        {#each slots as slot (slot.item.name)}
          {@const item = slot.item}
          {@const shown = resize?.name === item.name ? resize.size : slot.size}
          {#if item.kind === "widget"}
            <div
              data-home-name={item.name}
              {@attach editing ? undefined : long_press({ on_menu: (point) => home_item_menu(item, false, point, edit), ignore: "input, textarea, select, [contenteditable]" })}
              class={cn(
                "relative m-1.5 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 transition-opacity duration-150",
                editing && !resize && "motion-safe:animate-wiggle",
                drag?.moving && drag.item.name === item.name && "opacity-30",
                drop_before === item.name && "ring-2 ring-primary"
              )}
              style:grid-column="{slot.x + 1} / span {shown.w}"
              style:grid-row="{slot.y + 1} / span {shown.h}"
              aria-label={item.label}
            >
              <div data-widget-body class="min-h-0 flex-1 overflow-hidden" inert={editing}>
                <WidgetBody {item} size={slot.size} />
              </div>
              {#if editing}
                {@render edit_handlers(item, false)}
                {#if resizable(item)}
                  <button
                    type="button"
                    aria-label="Resize {item.label}"
                    class="absolute right-0 bottom-0 z-20 grid size-11 touch-none place-items-end p-2 text-primary"
                    onpointerdown={(event) => resize_start(event, slot)}
                    onpointermove={resize_move}
                    onpointerup={resize_end}
                    onlostpointercapture={resize_cancel}
                  >
                    <svg viewBox="0 0 10 10" class="size-3.5" aria-hidden="true"><path d="M10 1.5V8a2 2 0 0 1-2 2H1.5Z" fill="currentColor" /></svg>
                  </button>
                {/if}
                {#if resize?.name === item.name}
                  <span class="absolute top-2 left-2 z-20 rounded-md bg-primary px-1.5 py-0.5 font-mono text-2xs text-background tabular-nums">
                    {shown.w} × {shown.h}
                  </span>
                {/if}
              {/if}
            </div>
          {:else}
            <div
              data-home-name={item.name}
              class={cn("relative", editing && !drag?.moving && "motion-safe:animate-wiggle", drag?.moving && drag.item.name === item.name && "opacity-30")}
              style:grid-column="{slot.x + 1}"
              style:grid-row="{slot.y + 1}"
            >
              <button
                {@attach editing ? undefined : item_menu(item, false)}
                onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
                tabindex={editing ? -1 : undefined}
                class={cn(
                  "relative flex size-full flex-col items-center gap-1.5 rounded-2xl px-1 pt-2 active:bg-foreground/6",
                  drop_before === item.name && "before:absolute before:top-3 before:-left-px before:h-12 before:w-0.5 before:rounded-full before:bg-primary"
                )}
              >
                <HomeIcon {item} />
              </button>
              {#if editing}{@render edit_handlers(item, false)}{/if}
            </div>
          {/if}
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
        drag?.moving && drag.target?.zone === "dock" && !drag.docked && "bg-primary/10 ring-1 ring-primary/60"
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
        <div
          data-dock-name={item.name}
          class={cn(
            "relative rounded-2xl transition-opacity duration-150",
            drag?.moving && drag.item.name === item.name && "opacity-30",
            dock_before === item.name && "before:absolute before:top-1 before:-left-1 before:h-12 before:w-0.5 before:rounded-full before:bg-primary"
          )}
        >
          <button
            {@attach editing ? undefined : item_menu(item, true)}
            onclick={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
            tabindex={editing ? -1 : undefined}
            class="rounded-2xl"
          >
            <HomeIcon {item} label={false} class="shadow-none" />
          </button>
          {#if editing}{@render edit_handlers(item, true)}{/if}
        </div>
      {:else}
        <p class="max-w-40 px-2 text-2xs leading-tight text-foreground/80">{editing ? "Drag an icon here" : "Hold an icon, then Add to dock"}</p>
      {/each}
    </nav>
  </div>
</div>

{#if drag?.moving}
  <div class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 scale-110" style:left="{drag.point.x}px" style:top="{drag.point.y}px">
    {#if drag.item.kind === "widget"}
      <div class="grid size-16 place-items-center rounded-2xl bg-background-light shadow-popover ring-1 ring-primary/40">
        <HomeIcon item={drag.item} label={false} class="shadow-none ring-0" />
      </div>
    {:else}
      <HomeIcon item={drag.item} label={false} class="shadow-popover" />
    {/if}
  </div>
{/if}
