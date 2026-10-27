<script lang="ts">
  import kernel, {
    display_name,
    type AppsService,
    type DesktopItem,
    type MobileDesktopService,
    type UiService,
    WidgetStyle,
  } from "$lib/core/api";
  import { UiOverlay } from "$lib/core/api/services/ui/type";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { motion_ms } from "$lib/core/utils/motion";
  import { clamp_widget_size } from "$lib/core/api/services/apps/widget";
  import type { WidgetSize } from "$lib/core/api/services/apps/type";
  import { ArrowsVertical as ArrowsVerticalIcon, Minus as MinusIcon, Plus as PlusIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { background_menu, remove_item } from "../desktop/desktop-actions";
  import WidgetBody from "../desktop/widget-body.svelte";
  import { widget_surface } from "../desktop/widget-style";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import FileIcon from "../files/file-icon.svelte";
  import AppBadge from "../apps/app-badge.svelte";
  import AppProgress from "../apps/app-progress.svelte";
  import AppRow from "../apps/app-row.svelte";
  import { app_menu } from "../apps/app-actions";
  import { Button } from "../ui";
  import { add_widget_menu, EDIT_HOME_ITEM, home_item_menu } from "./home-actions";
  import { autoscroll_step, before_of, clamp_offset, drop_index, shift_of, type Slot } from "./home-drag";
  import { home_gesture } from "./home-gesture";
  import LetterIndex from "./letter-index.svelte";
  import { HOLD_MS, long_press } from "$lib/core/utils/long-press";
  import { fade } from "svelte/transition";

  const desktop = $derived(kernel.service<MobileDesktopService>("desktop"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const ui = $derived(kernel.service<UiService>("ui"));

  /** Widgets were sized for the grid's 104px rows; one row of height per cell keeps them readable in a full-width list. */
  const WIDGET_ROW = 104;
  /** In edit mode a short press picks an item up, so a quick swipe still scrolls the list. */
  const PICK_MS = 200;
  const DRAG_SLOP = 8;
  const RECENT_COUNT = 4;

  const items = $derived(desktop.home());

  /** An app already pinned on home is one tap away there, so it doesn't spend a recent slot. */
  const recent = $derived.by(() => {
    const pinned = new Set(items.flatMap((item) => (item.kind === "shortcut" ? [item.app_id] : [])));
    return apps.recent
      .filter((id) => !pinned.has(id))
      .flatMap((id) => apps.get(id) ?? [])
      .slice(0, RECENT_COUNT);
  });

  const clock = new Ticker(() => true, 60_000);
  const time = $derived(new Date(clock.now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const date = $derived(new Date(clock.now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }));

  /** An overlay in `ui`, so Back and Escape leave it like any layer. */
  const editing = $derived(ui.overlay === UiOverlay.HOME_EDIT);
  const edit = () => ui.open(UiOverlay.HOME_EDIT);

  const browsing = $derived(ui.overlay === UiOverlay.LAUNCHER);
  const missing = (item: DesktopItem) => item.kind === "shortcut" && !apps.get(item.app_id);
  const at = (event: MouseEvent): Position => ({ x: event.clientX, y: event.clientY });

  function background(point: Position) {
    void background_menu(point, [
      ...(editing ? [] : [{ item: EDIT_HOME_ITEM, run: edit }]),
      { item: { id: "add_widget", label: "Add widget", icon: PlusIcon }, run: () => void add_widget_menu(point) },
    ]);
  }

  const menu = (item: DesktopItem, point: Position) => void home_item_menu(item, point, { editing, on_edit: edit });

  let scroller = $state<HTMLElement>();
  let list = $state<HTMLElement>();

  interface Drag {
    name: string;
    from: number;
    start: Position;
    point: Position;
    /** This hold opened edit mode, so letting go without moving just leaves the item there. */
    entered: boolean;
    moving: boolean;
    /** Measured once the item first moves, in list coordinates; transforms don't touch `offsetTop`. */
    origin: number;
    slots: Slot[];
    stride: number;
    offset: number;
    to: number;
  }
  let drag = $state<Drag | null>(null);
  let frame = 0;

  /** Height only: a widget here is always the list's width, so a drag changes rows and `size.w` stays as the desktop set it. */
  interface Resize {
    name: string;
    start: number;
    from: WidgetSize;
    size: WidgetSize;
  }
  let resize = $state<Resize | null>(null);

  // Leaving removes the handles under a held pointer, so their capture is never lost.
  $effect(() => {
    if (editing) return;
    drag = null;
    resize = null;
  });

  function pick(name: string, point: Position) {
    const from = items.findIndex((item) => item.name === name);
    if (from === -1) return;
    const entered = !editing;
    if (entered) edit();
    navigator.vibrate?.(8);
    drag = { name, from, start: point, point, entered, moving: false, origin: 0, slots: [], stride: 0, offset: 0, to: from };
  }

  function follow() {
    if (!drag?.moving || !list) return;
    const y = drag.point.y - list.getBoundingClientRect().top;
    drag.offset = clamp_offset(drag.slots, drag.from, y - drag.origin);
    const to = drop_index(drag.slots, drag.from, drag.offset);
    if (to !== drag.to) navigator.vibrate?.(4);
    drag.to = to;
  }

  function move(point: Position) {
    if (!drag || !list) return;
    drag.point = point;
    if (!drag.moving) {
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) <= DRAG_SLOP) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-home-name]"));
      drag.slots = rows.map((row) => ({ top: row.offsetTop, height: row.offsetHeight }));
      drag.stride = drag.slots[drag.from].height + (parseFloat(getComputedStyle(list).rowGap) || 0);
      drag.origin = drag.start.y - list.getBoundingClientRect().top;
      drag.moving = true;
      frame = requestAnimationFrame(autoscroll);
    }
    follow();
  }

  function autoscroll() {
    if (!drag?.moving || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    const step = autoscroll_step(drag.point.y, rect.top, rect.bottom);
    if (step !== 0) {
      scroller.scrollTop += step;
      follow();
    }
    frame = requestAnimationFrame(autoscroll);
  }

  function drop(point: Position) {
    const finished = drag;
    drag = null;
    cancelAnimationFrame(frame);
    if (!finished) return;
    if (finished.moving) {
      const names = items.map((item) => item.name);
      if (finished.to !== finished.from) desktop.move_item(finished.name, before_of(names, finished.from, finished.to));
      return;
    }
    const item = items[finished.from];
    if (!finished.entered && item) menu(item, point);
  }

  function cancel() {
    drag = null;
    cancelAnimationFrame(frame);
  }

  function translate_of(index: number): string | undefined {
    if (!drag?.moving) return undefined;
    const y = index === drag.from ? drag.offset : shift_of(index, drag.from, drag.to, drag.stride);
    return y === 0 ? undefined : `0 ${y}px`;
  }

  function tap_outside(event: MouseEvent) {
    if (!editing || (event.target as Element).closest("[data-home-name], [data-home-keep]")) return;
    ui.close();
  }

  type Widget = Extract<DesktopItem, { kind: "widget" }>;
  const limits_of = (item: Widget) => apps.get(item.app_id)?.widget_size;
  const height_of = (item: Widget) => (resize?.name === item.name ? resize.size.h : item.size.h);

  function resize_start(event: PointerEvent, item: Widget) {
    if (!event.isPrimary) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resize = { name: item.name, start: event.clientY, from: item.size, size: item.size };
  }

  function resize_move(event: PointerEvent, item: Widget) {
    if (!resize || resize.name !== item.name) return;
    const rows = resize.from.h + Math.round((event.clientY - resize.start) / WIDGET_ROW);
    const next = clamp_widget_size({ w: resize.from.w, h: rows }, limits_of(item));
    if (next.h !== resize.size.h) navigator.vibrate?.(4);
    resize.size = next;
  }

  function resize_end() {
    const finished = resize;
    resize = null;
    if (!finished || finished.size.h === finished.from.h) return;
    void desktop.resize_widget(finished.name, finished.size);
  }

  function resize_key(event: KeyboardEvent, item: Widget) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    void desktop.resize_widget(item.name, { w: item.size.w, h: item.size.h + step });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -- a tap on empty space leaves edit mode; Escape and Done do from the keyboard. -->
<div class="relative isolate flex h-full flex-col pt-[env(safe-area-inset-top)] select-none [-webkit-touch-callout:none]" onclick={tap_outside}>
  <header class="relative px-6 pt-8 pb-3" data-wallpaper-label inert={browsing}>
    <div class={cn("transition-opacity duration-150", editing && "opacity-0")} aria-hidden={editing}>
      <p class="text-6xl leading-none font-light tracking-tight tabular-nums">{time}</p>
      <p class="mt-2 text-sm font-medium text-foreground/80">{date}</p>
    </div>
    {#if editing}
      <div data-home-keep class="absolute inset-x-4 top-1/2 flex items-center justify-between gap-2" transition:fade={{ duration: motion_ms(150) }}>
        <Button size="lg" onclick={(event) => add_widget_menu(at(event))}>
          <PlusIcon weight="bold" /> Add widget
        </Button>
        <Button size="lg" variant="primary" onclick={() => ui.close()}>Done</Button>
      </div>
    {/if}
  </header>

  <div
    bind:this={scroller}
    {@attach long_press({ on_menu: background, ignore: "[data-home-name], [data-home-row], [data-home-keep]" })}
    {@attach home_gesture({
      hold_ms: () => (editing ? PICK_MS : HOLD_MS),
      mouse_drags: () => editing,
      on_pick: pick,
      on_move: move,
      on_drop: drop,
      on_cancel: cancel,
      on_menu: (name, point) => {
        const item = items.find((entry) => entry.name === name);
        if (item) menu(item, point);
      },
    })}
    class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pr-14 pb-3 pl-4 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)] [scrollbar-width:none]"
    aria-label="Home screen"
    role="region"
    inert={browsing}
  >
    {#if recent.length > 0}
      <section class={cn("pt-4 transition-opacity duration-150", editing && "opacity-40")} aria-labelledby="home-recent" inert={editing}>
        <p id="home-recent" class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase" data-wallpaper-label>Recent</p>
        <ul class="flex flex-col">
          {#each recent as manifest (manifest.id)}
            <li>
              <AppRow
                {manifest}
                wallpaper
                data-home-row
                on_menu={(point) => void app_menu(manifest, point, { recent: true })}
                onclick={() => apps.launch(manifest.id)}
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <ul bind:this={list} class="relative mt-auto flex flex-col gap-0.5 pt-6" aria-label="Pinned">
      {#each items as item, index (item.name)}
        {@const lifted = drag?.name === item.name}
        <li
          data-home-name={item.name}
          class={cn("relative", drag?.moving && !lifted && "transition-[translate] duration-200 ease-out", lifted && "z-10")}
          style:translate={translate_of(index)}
        >
          <div
            class={cn("relative", item.kind === "widget" && "py-2", editing && !lifted && "animate-jiggle")}
            style:--jiggle={item.kind === "widget" ? "0.3deg" : "0.7deg"}
            style:animation-delay="{-(index % 4) * 60}ms"
            style:animation-direction={index % 2 === 0 ? "alternate" : "alternate-reverse"}
          >
            {#if item.kind === "widget"}
              <div
                class={cn(
                  "relative flex flex-col overflow-hidden rounded-2xl transition-[scale,box-shadow] duration-150",
                  widget_surface(item.style),
                  editing && item.style === WidgetStyle.CLEAR && "outline-1 -outline-offset-1 outline-foreground/30 outline-dashed",
                  lifted && "scale-[1.02] shadow-popover"
                )}
                style:height="{height_of(item) * WIDGET_ROW}px"
                role="group"
                aria-label={item.label}
              >
                <div class="min-h-0 flex-1 overflow-hidden" inert={editing}>
                  <WidgetBody {item} size={item.size} />
                </div>
                {#if editing}
                  <button type="button" class="absolute inset-0 rounded-2xl" aria-label="{item.label} options" onclick={(event) => menu(item, at(event))}></button>
                {/if}
                {#if resize?.name === item.name}
                  <span class="absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 font-mono text-2xs text-background tabular-nums">
                    {resize.size.h} {resize.size.h === 1 ? "row" : "rows"}
                  </span>
                {/if}
              </div>
              {#if editing && limits_of(item)}
                {@const limits = limits_of(item)!}
                <button
                  type="button"
                  data-home-control
                  aria-label="Resize {item.label}, {item.size.h} of {limits.min.h} to {limits.max.h} rows"
                  title="Drag or use the arrow keys to change the height"
                  class="absolute -right-5.5 -bottom-3.5 z-10 grid size-11 cursor-ns-resize touch-none place-items-center"
                  onpointerdown={(event) => resize_start(event, item)}
                  onpointermove={(event) => resize_move(event, item)}
                  onlostpointercapture={resize_end}
                  onkeydown={(event) => resize_key(event, item)}
                  oncontextmenu={(event) => event.preventDefault()}
                >
                  <span
                    class={cn(
                      "grid size-8 place-items-center rounded-full bg-background-lighter text-primary shadow-raised ring-1 ring-foreground/12",
                      resize?.name === item.name && "bg-primary text-background"
                    )}
                  >
                    <ArrowsVerticalIcon class="size-4.5" weight="bold" />
                  </span>
                </button>
              {/if}
            {:else}
              <button
                onclick={(event) => (editing ? menu(item, at(event)) : desktop.open(item, { anchor: at(event) }))}
                class={cn(
                  "flex min-h-14 w-full items-center gap-4 rounded-2xl px-2 py-1.5 text-left transition-[background-color,scale,box-shadow] duration-150 active:bg-foreground/8",
                  lifted && "scale-[1.02] bg-background-light/90 shadow-popover"
                )}
              >
                {#if item.kind === "shortcut"}
                  <span class="grid size-11 shrink-0 place-items-center">
                    <span class="relative">
                      <ShortcutIcon app_id={item.app_id} badge={false} class="size-7" />
                      <AppProgress app_id={item.app_id} />
                      <AppBadge app_id={item.app_id} />
                    </span>
                  </span>
                {:else}
                  <span class="grid size-11 shrink-0 place-items-center">
                    <FileIcon
                      name={item.name}
                      kind={item.kind}
                      mime_type={item.kind === "file" ? item.type : undefined}
                      class={cn("bare-glyph size-7 shrink-0", item.kind === "directory" ? "text-primary" : "text-foreground/85")}
                      weight={item.kind === "directory" ? "fill" : "duotone"}
                    />
                  </span>
                {/if}
                <span data-wallpaper-label class="truncate text-2xl tracking-tight">
                  {display_name(item)}{#if missing(item)}<span class="text-error"> · missing</span>{/if}
                </span>
              </button>
            {/if}
            {#if editing && !lifted}
              <button
                type="button"
                data-home-control
                aria-label="Remove {display_name(item)}"
                class={cn("absolute z-10 grid size-11 place-items-center", item.kind === "widget" ? "-top-3.5 -left-5.5" : "-top-2 -left-1.5")}
                onclick={() => void remove_item(item)}
                transition:fade={{ duration: motion_ms(120) }}
              >
                <span class="grid size-6 place-items-center rounded-full bg-background-lighter text-foreground shadow-raised ring-1 ring-foreground/12">
                  <MinusIcon class="size-3.5" weight="bold" />
                </span>
              </button>
            {/if}
          </div>
        </li>
      {:else}
        <li class="flex flex-col gap-1 px-2 pb-2" data-wallpaper-label>
          <p class="text-base font-medium">Nothing pinned yet</p>
          <p class="text-sm text-foreground/65">Slide along the letters to find an app, then hold it to pin it here. Hold the background to add a widget.</p>
        </li>
      {/each}
    </ul>

    <button
      data-home-row
      onclick={() => apps.launch("app-library")}
      class={cn(
        "mt-1 flex min-h-14 w-full items-center gap-4 rounded-2xl px-2 py-1.5 text-left text-foreground/65 transition-[background-color,opacity] duration-150 active:bg-foreground/8",
        editing && "opacity-40"
      )}
      inert={editing}
    >
      <span class="grid size-11 shrink-0 place-items-center"><SquaresFourIcon class="size-6" weight="duotone" /></span>
      <span data-wallpaper-label class="text-xl tracking-tight">All apps</span>
    </button>
  </div>

  {#if !editing}
    <LetterIndex onlaunch={(id) => apps.launch(id)} />
  {/if}
</div>
