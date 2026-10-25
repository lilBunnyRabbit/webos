<script lang="ts">
  import kernel, {
    display_name,
    type AppsService,
    type DesktopItem,
    type MobileDesktopService,
    type OfflineService,
    type UiService,
    WidgetStyle,
  } from "$lib/core/api";
  import { UiOverlay } from "$lib/core/api/services/ui/type";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { motion_ms } from "$lib/core/utils/motion";
  import { DotsSixVertical as DotsSixVerticalIcon, Plus as PlusIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { background_menu } from "../desktop/desktop-actions";
  import WidgetBody from "../desktop/widget-body.svelte";
  import { widget_surface } from "../desktop/widget-style";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import FileIcon from "../files/file-icon.svelte";
  import AppBadge from "../apps/app-badge.svelte";
  import AppRow from "../apps/app-row.svelte";
  import { app_menu } from "../apps/app-actions";
  import { launch_or_explain } from "../apps/offline-actions";
  import { Button } from "../ui";
  import { add_widget_menu, EDIT_HOME_ITEM, home_item_menu } from "./home-actions";
  import LetterIndex from "./letter-index.svelte";
  import { long_press } from "$lib/core/utils/long-press";
  import { fade } from "svelte/transition";

  const desktop = $derived(kernel.service<MobileDesktopService>("desktop"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const offline = $derived(kernel.service<OfflineService>("offline"));
  const ui = $derived(kernel.service<UiService>("ui"));

  /** Widgets were sized for the grid's 104px rows; one row of height per cell keeps them readable in a full-width list. */
  const WIDGET_ROW = 104;
  const DRAG_SLOP = 8;
  const RECENT_COUNT = 4;

  const items = $derived(desktop.home());

  /** An app already pinned on home is one tap away there, so it doesn't spend a recent slot. */
  const recent = $derived.by(() => {
    const pinned = new Set(items.flatMap((item) => (item.kind === "shortcut" ? [item.app_id] : [])));
    return apps.recent
      .filter((id) => !pinned.has(id) && apps.is_installed(id))
      .flatMap((id) => apps.get(id) ?? [])
      .slice(0, RECENT_COUNT);
  });

  const clock = new Ticker(() => true, 60_000);
  const time = $derived(new Date(clock.now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const date = $derived(new Date(clock.now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }));

  /**
   * Edit mode exists because a drag after a hold never started on Samsung Internet: until the hold fired the browser
   * owned the touch and claimed it as a scroll. Here the grips carry `touch-action: none` from the start, so the press is ours.
   * It lives in `ui` as an overlay so Back and Escape leave it.
   */
  const editing = $derived(ui.overlay === UiOverlay.HOME_EDIT);
  const edit = () => ui.open(UiOverlay.HOME_EDIT);


  const browsing = $derived(ui.overlay === UiOverlay.LAUNCHER);
  const missing = (item: DesktopItem) => item.kind === "shortcut" && !apps.get(item.app_id);

  function background(point: Position) {
    void background_menu(point, [
      { item: EDIT_HOME_ITEM, run: edit },
      { item: { id: "add_widget", label: "Add widget", icon: PlusIcon }, run: () => void add_widget_menu(point) },
    ]);
  }

  interface Drag {
    name: string;
    start: Position;
    point: Position;
    moving: boolean;
    before: string | null | undefined;
  }
  let drag = $state<Drag | null>(null);

  // Leaving removes the grips under a held pointer, so their capture is never lost.
  $effect(() => {
    if (!editing) drag = null;
  });

  function drag_start(event: PointerEvent, item: DesktopItem) {
    if (!event.isPrimary) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    drag = { name: item.name, start: point, point, moving: false, before: undefined };
  }

  function drag_move(event: PointerEvent) {
    if (!drag) return;
    drag.point = { x: event.clientX, y: event.clientY };
    if (!drag.moving && Math.abs(drag.point.y - drag.start.y) <= DRAG_SLOP) return;
    if (!drag.moving) navigator.vibrate?.(4);
    drag.moving = true;
    const row = document.elementFromPoint(drag.point.x, drag.point.y)?.closest<HTMLElement>("[data-home-name]");
    if (!row) return (drag.before = undefined);
    const rect = row.getBoundingClientRect();
    const name = row.dataset.homeName!;
    const position = items.findIndex((item) => item.name === name);
    drag.before = drag.point.y < rect.top + rect.height / 2 ? name : (items[position + 1]?.name ?? null);
    if (drag.before === drag.name) drag.before = undefined;
  }

  function drag_end() {
    const finished = drag;
    drag = null;
    if (!finished?.moving || finished.before === undefined) return;
    desktop.move_item(finished.name, finished.before);
  }
</script>

<div class="relative isolate flex h-full flex-col pt-[env(safe-area-inset-top)] select-none [-webkit-touch-callout:none]">
  {#if editing}
    <div class="flex items-center justify-between gap-2 px-4 pt-3" transition:fade={{ duration: motion_ms(150) }}>
      <Button variant="secondary" onclick={(event) => add_widget_menu({ x: event.clientX, y: event.clientY })}>
        <PlusIcon weight="bold" /> Add widget
      </Button>
      <Button onclick={() => ui.close()}>Done</Button>
    </div>
  {/if}

  <header class="px-6 pt-8 pb-3" data-wallpaper-label inert={browsing}>
    <p class="text-6xl leading-none font-light tracking-tight tabular-nums">{time}</p>
    <p class="mt-2 text-sm font-medium text-foreground/80">{date}</p>
  </header>

  <div
    {@attach long_press({ on_menu: background, ignore: "[data-home-name], [data-home-row]" })}
    class={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-3 pl-4 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)] [scrollbar-width:none]", editing ? "pr-4" : "pr-14")}
    aria-label="Home screen"
    role="region"
    inert={browsing}
  >
    {#if !editing && recent.length > 0}
      <section class="pt-4" aria-labelledby="home-recent" transition:fade={{ duration: motion_ms(150) }}>
        <p id="home-recent" class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase" data-wallpaper-label>Recent</p>
        <ul class="flex flex-col">
          {#each recent as manifest (manifest.id)}
            <li>
              <AppRow
                {manifest}
                wallpaper
                data-home-row
                on_menu={(point) => void app_menu(manifest, point, { recent: true })}
                onclick={() => launch_or_explain(manifest.id)}
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <ul class="mt-auto flex flex-col gap-0.5 pt-6" aria-label="Pinned">
      {#each items as item (item.name)}
        <li
          data-home-name={item.name}
          class={cn(
            "relative rounded-2xl transition-opacity duration-150",
            drag?.moving && drag.name === item.name && "opacity-30",
            drag?.moving && drag.before === item.name && "before:absolute before:inset-x-2 before:-top-1 before:h-0.5 before:rounded-full before:bg-primary"
          )}
        >
          {#if item.kind === "widget"}
            <div
              {@attach editing ? undefined : long_press({ on_menu: (point) => home_item_menu(item, point, edit), ignore: "input, textarea, select, [contenteditable]" })}
              class={cn(
                "my-2 flex flex-col overflow-hidden rounded-2xl",
                widget_surface(item.style),
                editing && "mr-12",
                editing && item.style === WidgetStyle.CLEAR && "outline-1 -outline-offset-1 outline-foreground/30 outline-dashed"
              )}
              style:height="{item.size.h * WIDGET_ROW}px"
              role="group"
              aria-label={item.label}
            >
              <div class="min-h-0 flex-1 overflow-hidden" inert={editing}>
                <WidgetBody {item} size={item.size} />
              </div>
            </div>
          {:else}
            <button
              {@attach editing ? undefined : long_press({ on_menu: (point) => home_item_menu(item, point, edit) })}
              onclick={editing ? undefined : (event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
              tabindex={editing ? -1 : undefined}
              class={cn("flex min-h-14 w-full items-center gap-4 rounded-2xl px-2 py-1.5 text-left transition-colors duration-150 active:bg-foreground/8", editing && "pr-14")}
            >
              {#if item.kind === "shortcut"}
                <span class={cn("grid size-11 shrink-0 place-items-center", !offline.can_open(item.app_id) && "opacity-38")}>
                  <span class="relative">
                    <ShortcutIcon app_id={item.app_id} badge={false} class="size-7" />
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
          {#if editing}
            <button
              type="button"
              aria-label="Move {display_name(item)}"
              class="absolute top-1/2 right-0 z-10 grid size-11 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full bg-background-light/90 text-foreground/80 shadow-raised active:cursor-grabbing"
              onpointerdown={(event) => drag_start(event, item)}
              onpointermove={drag_move}
              onpointerup={drag_end}
              onlostpointercapture={() => (drag = null)}
            >
              <DotsSixVerticalIcon class="size-5" weight="bold" />
            </button>
          {/if}
        </li>
      {:else}
        <li class="flex flex-col gap-1 px-2 pb-2" data-wallpaper-label>
          <p class="text-base font-medium">Nothing pinned yet</p>
          <p class="text-sm text-foreground/65">Slide along the letters to find an app, then hold it to pin it here. Hold the background to add a widget.</p>
        </li>
      {/each}
    </ul>

    {#if !editing}
      <button
        data-home-row
        onclick={() => launch_or_explain("app-library")}
        class="mt-1 flex min-h-14 w-full items-center gap-4 rounded-2xl px-2 py-1.5 text-left text-foreground/65 transition-colors duration-150 active:bg-foreground/8"
        transition:fade={{ duration: motion_ms(150) }}
      >
        <span class="grid size-11 shrink-0 place-items-center"><SquaresFourIcon class="size-6" weight="duotone" /></span>
        <span data-wallpaper-label class="text-xl tracking-tight">All apps</span>
      </button>
    {/if}
  </div>

  {#if !editing}
    <LetterIndex onlaunch={launch_or_explain} />
  {/if}
</div>
